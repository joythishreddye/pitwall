"""The eval's intent cache: replayed answers and patient retries."""

import asyncio
import importlib.util
from pathlib import Path

import pytest

from app.llm.base import LLMError

_PATH = Path(__file__).resolve().parents[1] / "scripts" / "intent_cache.py"
_spec = importlib.util.spec_from_file_location("intent_cache", _PATH)
ic = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ic)


def test_the_key_changes_with_the_model_the_prompt_or_the_question() -> None:
    key = ic.cache_key("m", "prompt", "Who won?")
    assert key == ic.cache_key("m", "prompt", "Who won?")
    assert key != ic.cache_key("other", "prompt", "Who won?")
    assert key != ic.cache_key("m", "prompt v2", "Who won?")
    assert key != ic.cache_key("m", "prompt", "Who lost?")


def test_a_recorded_answer_comes_back_from_the_file_as_a_copy(tmp_path) -> None:
    path = tmp_path / "cache.json"
    answer = {"intent": "race", "entities": {"drivers": ["Leclerc"]}}
    ic.IntentCache(path, "m", "p").put("Who won?", answer)

    cache = ic.IntentCache(path, "m", "p")
    got = cache.get("Who won?")
    assert got == answer
    got["entities"]["drivers"].append("Sainz")
    assert cache.get("Who won?") == answer
    assert cache.get("Who lost?") is None
    assert (cache.hits, cache.misses) == (2, 1)
    # Another prompt is another key, so the old answer doesn't apply
    assert ic.IntentCache(path, "m", "p2").get("Who won?") is None


class _FlakyLLM:
    model = "m"

    def __init__(self, errors: list[LLMError]) -> None:
        self.errors = errors
        self.calls = 0

    async def generate(self, messages, **kwargs) -> str:
        self.calls += 1
        if self.errors:
            raise self.errors.pop(0)
        return '{"intent": "race"}'


def test_a_rate_limit_is_waited_out_and_the_call_retried() -> None:
    waits: list[float] = []

    async def sleep(seconds: float) -> None:
        waits.append(seconds)

    inner = _FlakyLLM([LLMError("429", status_code=429, retry_after=5)])
    llm = ic.PatientLLM(inner, sleep=sleep)
    assert asyncio.run(llm.generate([], json_mode=True)) == '{"intent": "race"}'
    assert inner.calls == 2
    assert waits == [6]
    assert llm.failed is False


def test_another_error_fails_at_once_and_is_flagged() -> None:
    llm = ic.PatientLLM(_FlakyLLM([LLMError("boom", status_code=500)]))
    with pytest.raises(LLMError):
        asyncio.run(llm.generate([]))
    assert llm.failed is True


def test_a_limit_that_outlasts_the_wait_fails_and_is_flagged() -> None:
    async def sleep(seconds: float) -> None:
        return None

    errors = [LLMError("429", status_code=429, retry_after=120) for _ in range(9)]
    llm = ic.PatientLLM(_FlakyLLM(errors), sleep=sleep, max_wait=300)
    with pytest.raises(LLMError):
        asyncio.run(llm.generate([]))
    assert llm.failed is True
