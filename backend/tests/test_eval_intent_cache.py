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


_STAND_IN = {
    "intent": "unknown",
    "entities": {"drivers": [], "teams": [], "circuits": [], "seasons": []},
    "metadata_filter": {},
}


def test_only_the_models_own_answer_is_recorded(tmp_path) -> None:
    path = tmp_path / "cache.json"
    cache = ic.IntentCache(path, "m", "p")
    # A failed call, and a 200 whose reply wasn't usable JSON: both stand-ins
    assert cache.record("Who won?", {"intent": "factual"}, failed=True) is False
    assert cache.record("Who won?", dict(_STAND_IN), failed=False) is False
    assert not path.exists()
    assert cache.failed == 2

    assert cache.record("Who won?", {"intent": "factual"}, failed=False) is True
    assert ic.IntentCache(path, "m", "p").get("Who won?") == {"intent": "factual"}
    assert cache.failed == 2
    assert not path.with_name(path.name + ".tmp").exists()


def test_once_a_limit_outlasts_the_wait_later_calls_fail_without_waiting() -> None:
    waits: list[float] = []

    async def sleep(seconds: float) -> None:
        waits.append(seconds)

    errors = [LLMError("429", status_code=429, retry_after=120) for _ in range(9)]
    llm = ic.PatientLLM(_FlakyLLM(errors), sleep=sleep, max_wait=300)
    with pytest.raises(LLMError):
        asyncio.run(llm.generate([]))
    assert llm.closed is True
    waited = len(waits)

    with pytest.raises(LLMError):
        asyncio.run(llm.generate([]))
    assert len(waits) == waited
    assert llm.failed is True


def test_a_closed_run_still_takes_an_answer_that_comes_through() -> None:
    llm = ic.PatientLLM(_FlakyLLM([]))
    llm.closed = True
    assert asyncio.run(llm.generate([])) == '{"intent": "race"}'
    assert llm.failed is False


def test_the_summary_counts_replays_and_warns_only_when_a_call_failed(
    tmp_path,
) -> None:
    cache = ic.IntentCache(tmp_path / "cache.json", "m", "p")
    cache.hits, cache.misses, cache.failed = 64, 2, 0
    lines = cache.summary_lines()
    assert lines == ["Intent answers: 64 replayed, 2 asked, 0 failed"]

    cache.failed = 1
    lines = cache.summary_lines()
    assert lines[0] == "Intent answers: 64 replayed, 2 asked, 1 failed"
    assert lines[1].startswith("WARNING: 1 intent call failed")
    assert "stand-in" in lines[1]

    cache.failed = 3
    assert cache.summary_lines()[1].startswith("WARNING: 3 intent calls failed")
