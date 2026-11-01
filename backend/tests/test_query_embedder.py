"""QueryEmbedder: caching, budget enforcement and failure handling."""

from unittest.mock import MagicMock

import httpx
import pytest

from app.rag.query_embedder import EmbeddingUnavailable, QueryEmbedder


def _embedder(handler, *, allowed: bool = True) -> tuple[QueryEmbedder, MagicMock]:
    budget = MagicMock()
    budget.consume.return_value = allowed
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return QueryEmbedder(token="hf_test", budget=budget, client=client), budget


def _ok(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json=[[0.1] * 768])


def test_embeds_and_serves_repeats_from_cache() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return _ok(request)

    embedder, budget = _embedder(handler)
    first = embedder.embed_query("Who won Monza?")
    second = embedder.embed_query("  Who won   Monza? ")

    assert first == second
    assert len(first) == 768
    assert len(calls) == 1
    assert budget.consume.call_count == 1
    assert calls[0].headers["Authorization"] == "Bearer hf_test"
    assert embedder.status == "ok"


def test_status_is_unknown_before_any_call() -> None:
    embedder, _ = _embedder(_ok)
    assert embedder.status == "unknown"


def test_budget_refusal_skips_the_network() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("HuggingFace must not be called over budget")

    embedder, _ = _embedder(handler, allowed=False)

    with pytest.raises(EmbeddingUnavailable, match="ceiling"):
        embedder.embed_query("q")
    assert embedder.status == "unavailable"


def test_payment_required_raises_unavailable() -> None:
    embedder, _ = _embedder(lambda r: httpx.Response(402, json={"error": "credits"}))

    with pytest.raises(EmbeddingUnavailable, match="402"):
        embedder.embed_query("q")


def test_network_error_raises_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    embedder, _ = _embedder(handler)

    with pytest.raises(EmbeddingUnavailable, match="unreachable"):
        embedder.embed_query("q")


def test_unexpected_shape_raises_unavailable() -> None:
    embedder, _ = _embedder(lambda r: httpx.Response(200, json=[[0.1] * 10]))

    with pytest.raises(EmbeddingUnavailable, match="shape"):
        embedder.embed_query("q")


def test_bypassing_the_cache_forces_a_real_call() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return _ok(request)

    embedder, _ = _embedder(handler)
    embedder.embed_query("probe")
    embedder.embed_query("probe", use_cache=False)

    assert len(calls) == 2


def test_recovers_after_a_failure() -> None:
    responses = iter([httpx.Response(503), httpx.Response(200, json=[[0.2] * 768])])
    embedder, _ = _embedder(lambda r: next(responses))

    with pytest.raises(EmbeddingUnavailable):
        embedder.embed_query("q")
    assert embedder.embed_query("q") == [0.2] * 768
    assert embedder.status == "ok"
