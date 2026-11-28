"""The intent model's answers in a file, so evals replay the same classifier outputs.

The intent model's answer depends only on the model, its prompt and the question,
so a change to chunking, documents or the linker can be scored on the answers an
earlier run recorded. Two runs then differ only in what changed (the model varies
a little even at temperature 0), and a replayed answer spends no Groq tokens: the
free tier caps the intent model at 200k tokens a day, shared with production.

The key holds the model id, the prompt and the question only. A change to the
intent call itself (its parameters or the reasoning effort) needs a fresh file.
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import logging
import os
from collections.abc import Awaitable, Callable
from pathlib import Path

from app.llm.base import LLMError

logger = logging.getLogger("eval_rag")

# A refusal for the daily cap asks for a wait of a few minutes; give up on a
# question after this long, and stop waiting for the rest of the run, so a
# closed day can't hang a run for hours
MAX_WAIT_SECONDS = 15 * 60
# When the refusal names no wait
DEFAULT_WAIT_SECONDS = 60.0
# The retriever's stand-in when classification fails (Retriever.classify_intent)
STAND_IN_INTENT = "unknown"


def cache_key(model: str, prompt: str, question: str) -> str:
    """The model id, a digest of its prompt and the question; a change to any misses."""
    digest = hashlib.sha256(prompt.encode()).hexdigest()[:12]
    return f"{model}|{digest}|{question}"


class IntentCache:
    """Recorded intent answers in a JSON file, written after every new one."""

    def __init__(self, path: Path, model: str, prompt: str) -> None:
        self.path = path
        self.model = model
        self.prompt = prompt
        self.entries: dict[str, dict] = (
            json.loads(path.read_text()) if path.exists() else {}
        )
        self.hits = 0
        self.misses = 0
        self.failed = 0

    def get(self, question: str) -> dict | None:
        """A copy of the recorded answer, or None (counted as a hit or a miss)."""
        found = self.entries.get(cache_key(self.model, self.prompt, question))
        if found is None:
            self.misses += 1
            return None
        self.hits += 1
        return copy.deepcopy(found)

    def has(self, question: str) -> bool:
        return cache_key(self.model, self.prompt, question) in self.entries

    def put(self, question: str, intent: dict) -> None:
        self.entries[cache_key(self.model, self.prompt, question)] = intent
        # Write a temporary file and swap it in, so a killed run can't leave
        # half a file behind
        tmp = self.path.with_name(self.path.name + ".tmp")
        tmp.write_text(
            json.dumps(self.entries, indent=1, sort_keys=True, ensure_ascii=False)
            + "\n"
        )
        os.replace(tmp, self.path)

    def record(self, question: str, intent: dict, failed: bool) -> bool:
        """Keep the model's answer; skip and count a failed call's stand-in.

        The retriever answers intent "unknown" (not one of the prompt's intents)
        when the call fails or the reply isn't a usable JSON object, so that
        answer is never the model's, even after a 200.
        """
        if failed or intent.get("intent") == STAND_IN_INTENT:
            self.failed += 1
            return False
        self.put(question, intent)
        return True


class PatientLLM:
    """The intent model, waiting out rate limits instead of failing.

    `failed` says whether the last call ended in an error, so an answer the
    retriever made up after a failure is never recorded as the model's. Once a
    limit outlasts the wait, `closed` is set and later calls fail at once.
    """

    def __init__(
        self,
        llm,
        sleep: Callable[[float], Awaitable[object]] = asyncio.sleep,
        max_wait: float = MAX_WAIT_SECONDS,
    ) -> None:
        self.llm = llm
        self.model = getattr(llm, "model", "")
        self._sleep = sleep
        self.max_wait = max_wait
        self.failed = False
        self.closed = False

    async def generate(self, messages, **kwargs) -> str:
        waited = 0.0
        while True:
            try:
                answer = await self.llm.generate(messages, **kwargs)
            except LLMError as exc:
                if exc.rate_limited and not self.closed and waited < self.max_wait:
                    delay = min(exc.retry_after or DEFAULT_WAIT_SECONDS, self.max_wait)
                    delay = min(delay, self.max_wait - waited) + 1
                    logger.warning("Intent model rate-limited; waiting %.0f s", delay)
                    await self._sleep(delay)
                    waited += delay
                    continue
                if exc.rate_limited and not self.closed:
                    logger.warning(
                        "Intent model still rate-limited after %.0f s; "
                        "the rest of the run won't wait",
                        waited,
                    )
                    self.closed = True
                self.failed = True
                raise
            self.failed = False
            return answer
