"""Query-time embeddings via the HuggingFace Inference Providers router.

The API server embeds search queries remotely so the 400MB BGE model never
loads on Render's 512MB instance. The local ``Embedder`` is still used for
batch ingestion.

Two guards keep this cheap and predictable:

* an in-process LRU cache, because the retriever embeds the same query
  several times per question (main search, entity searches, retries);
* a monthly call ceiling counted in Postgres (``ApiBudget``).

When the ceiling or HuggingFace itself says no, callers get
``EmbeddingUnavailable`` and fall back to full-text search.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from datetime import UTC, datetime
from typing import NoReturn

import httpx

from app.config import settings
from app.rag.budget import ApiBudget

logger = logging.getLogger(__name__)

_MODEL_URL = "https://router.huggingface.co/hf-inference/models/BAAI/bge-base-en-v1.5"
_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
_DIMENSION = 768
# After a failure (no credits, outage, budget spent), skip HuggingFace for a
# while instead of paying a round trip and a budget write on every question.
_FAILURE_COOLDOWN_SECONDS = 120.0


class EmbeddingUnavailable(RuntimeError):
    """A query embedding couldn't be produced (budget, auth, credits, outage)."""


class QueryEmbedder:
    """Embed search queries with BGE-base-en-v1.5 on HuggingFace."""

    def __init__(
        self,
        *,
        token: str | None = None,
        budget: ApiBudget | None = None,
        cache_size: int = 512,
        client: httpx.Client | None = None,
    ) -> None:
        api_token = token or settings.huggingface_api_token
        self._headers = {"Authorization": f"Bearer {api_token}"}
        self._client = client or httpx.Client(timeout=15.0)
        self._budget = budget
        self._cache: OrderedDict[str, list[float]] = OrderedDict()
        self._cache_size = cache_size
        self._lock = threading.Lock()
        self.last_ok_at: datetime | None = None
        self.last_error: str | None = None
        self._cooldown_until = 0.0

    @property
    def dimension(self) -> int:
        return _DIMENSION

    @property
    def status(self) -> str:
        """``ok``, ``unavailable`` or ``unknown`` (no remote call yet)."""
        if self.last_error is not None:
            return "unavailable"
        return "ok" if self.last_ok_at is not None else "unknown"

    def embed_query(self, query: str, *, use_cache: bool = True) -> list[float]:
        """Embed one search query.

        Args:
            query: The user's question.
            use_cache: Serve repeats from the in-process cache and honour the
                failure cool-down. Readiness probes pass False to force a
                real call.

        Returns:
            A 768-dimension embedding.

        Raises:
            EmbeddingUnavailable: The budget is spent or HuggingFace failed.
        """
        key = " ".join(query.split())
        if use_cache:
            with self._lock:
                cached = self._cache.get(key)
                if cached is not None:
                    self._cache.move_to_end(key)
                    return cached
            if time.monotonic() < self._cooldown_until:
                raise EmbeddingUnavailable("HuggingFace cooling down after a failure")

        if self._budget is not None and not self._budget.consume():
            self._fail("monthly HuggingFace call ceiling reached")

        try:
            response = self._client.post(
                _MODEL_URL,
                headers=self._headers,
                json={"inputs": _QUERY_PREFIX + key},
            )
        except httpx.HTTPError as exc:
            self._fail(f"HuggingFace unreachable: {exc}")

        if response.status_code != 200:
            self._fail(f"HuggingFace returned {response.status_code}")

        try:
            data = response.json()
        except ValueError:
            self._fail("HuggingFace returned a non-JSON body")
        vector = (
            data[0]
            if isinstance(data, list) and data and isinstance(data[0], list)
            else data
        )
        if not isinstance(vector, list) or len(vector) != _DIMENSION:
            self._fail("HuggingFace returned an unexpected embedding shape")

        self.last_ok_at = datetime.now(UTC)
        self.last_error = None
        self._cooldown_until = 0.0
        with self._lock:
            self._cache[key] = vector
            self._cache.move_to_end(key)
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)
        return vector

    def _fail(self, reason: str) -> NoReturn:
        self.last_error = reason
        self._cooldown_until = time.monotonic() + _FAILURE_COOLDOWN_SECONDS
        logger.warning("Query embedding unavailable: %s", reason)
        raise EmbeddingUnavailable(reason)

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()
