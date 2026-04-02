"""Lightweight query embedder using HuggingFace Inference API.

Used by the API server for query-time embedding without loading
the 400MB BGE model locally. Keeps Render under 512MB memory.
The local Embedder class is still used for batch ingestion.
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_MODEL_URL = (
    "https://router.huggingface.co"
    "/hf-inference/models/BAAI/bge-base-en-v1.5"
)
_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


class QueryEmbedder:
    """Embed search queries via HuggingFace Inference API (free tier)."""

    def __init__(self) -> None:
        token = settings.huggingface_api_token
        self._headers = {"Authorization": f"Bearer {token}"}
        self._client = httpx.Client(timeout=15.0)

    @property
    def dimension(self) -> int:
        return 768

    def embed_query(self, query: str) -> list[float]:
        """Embed a single search query via the HF Inference API."""
        prefixed = _QUERY_PREFIX + query
        response = self._client.post(
            _MODEL_URL,
            headers=self._headers,
            json={"inputs": prefixed},
        )
        response.raise_for_status()
        data = response.json()

        # HF returns [[float, ...]] for single input
        if isinstance(data, list) and isinstance(data[0], list):
            return data[0]
        return data
