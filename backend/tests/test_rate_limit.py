"""Sliding-window limiter and client address extraction."""

import pytest
from starlette.requests import Request

from app.api.rate_limit import SlidingWindowLimiter, client_ip


def test_blocks_a_client_over_its_limit() -> None:
    limiter = SlidingWindowLimiter(per_key=2, global_limit=100, window_seconds=60)

    assert limiter.check("a", now=0) is None
    assert limiter.check("a", now=1) is None
    assert limiter.check("a", now=2) == pytest.approx(58)
    assert limiter.check("b", now=2) is None


def test_window_slides() -> None:
    limiter = SlidingWindowLimiter(per_key=1, global_limit=100, window_seconds=60)

    assert limiter.check("a", now=0) is None
    assert limiter.check("a", now=30) is not None
    assert limiter.check("a", now=61) is None


def test_refused_hits_are_not_recorded() -> None:
    limiter = SlidingWindowLimiter(per_key=1, global_limit=100, window_seconds=60)

    limiter.check("a", now=0)
    for t in range(1, 50):
        limiter.check("a", now=t)
    assert limiter.check("a", now=60.5) is None


def test_global_limit_applies_across_clients() -> None:
    limiter = SlidingWindowLimiter(per_key=10, global_limit=3, window_seconds=60)

    for key in ("a", "b", "c"):
        assert limiter.check(key, now=0) is None
    assert limiter.check("d", now=1) == pytest.approx(59)


def _request(headers: list[tuple[bytes, bytes]]) -> Request:
    return Request({"type": "http", "headers": headers, "client": ("9.9.9.9", 1234)})


def test_client_ip_prefers_the_proxy_appended_address() -> None:
    request = _request([(b"x-forwarded-for", b"1.1.1.1, 2.2.2.2")])
    assert client_ip(request) == "2.2.2.2"


def test_client_ip_falls_back_to_the_socket() -> None:
    assert client_ip(_request([])) == "9.9.9.9"
