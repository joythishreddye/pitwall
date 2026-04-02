"""BGE-base-en-v1.5 embedding model singleton."""

import logging
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

_MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


class Embedder:
    """Singleton wrapper around BAAI/bge-base-en-v1.5 (768 dim)."""

    _instance: "Embedder | None" = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        from sentence_transformers import SentenceTransformer

        _MODELS_DIR.mkdir(exist_ok=True)
        logger.info("Loading BGE-base-en-v1.5 (cache: %s)", _MODELS_DIR)
        self.model = SentenceTransformer(
            "BAAI/bge-base-en-v1.5",
            cache_folder=str(_MODELS_DIR),
        )
        logger.info("Embedding model loaded — dimension: %d", self.dimension)

    @classmethod
    def get(cls) -> "Embedder":
        """Return the singleton instance, creating it on first call."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def dimension(self) -> int:
        return 768

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed document chunks (no query prefix)."""
        embeddings = self.model.encode(texts, normalize_embeddings=True)
        return embeddings.tolist()

    def embed_query(self, query: str) -> list[float]:
        """Embed a search query with BGE query prefix."""
        prefixed = _QUERY_PREFIX + query
        embedding = self.model.encode(prefixed, normalize_embeddings=True)
        return embedding.tolist()
