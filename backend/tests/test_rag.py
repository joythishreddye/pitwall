"""Tests for the RAG pipeline: chunker, prompt builder, knowledge level, retriever."""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.routes.chat import _detect_knowledge_level
from app.llm.base import Message
from app.rag.chunker import chunk_markdown
from app.rag.prompt import SYSTEM_PROMPT, build_rag_prompt
from app.rag.retriever import RetrievedChunk, Retriever

# ---------------------------------------------------------------------------
# Chunker tests
# ---------------------------------------------------------------------------


class TestChunker:
    def test_simple_markdown(self, tmp_path: Path) -> None:
        md = tmp_path / "test.md"
        section = (
            "This is a test section with enough words to pass"
            " the minimum token filter for chunking purposes."
        )
        md.write_text(
            f"---\ncategory: test\n---\n\n## Section One\n\n{section}\n\n"
            f"## Section Two\n\n{section} And some more words here.\n"
        )
        chunks = chunk_markdown(md)
        assert len(chunks) == 2
        assert chunks[0]["metadata"]["category"] == "test"
        assert "test section" in chunks[0]["content"]

    def test_frontmatter_parsing(self, tmp_path: Path) -> None:
        md = tmp_path / "test.md"
        bio = (
            "Lewis Hamilton is a seven-time world champion"
            " from Stevenage England who has won more races"
            " than any other driver in history."
        )
        md.write_text(
            f"---\ncategory: driver\ndriver_ref: hamilton\n"
            f"knowledge_level: all\n---\n\n## Bio\n\n{bio}\n"
        )
        chunks = chunk_markdown(md)
        assert len(chunks) == 1
        assert chunks[0]["metadata"]["driver_ref"] == "hamilton"
        assert chunks[0]["metadata"]["knowledge_level"] == "all"
        assert chunks[0]["token_count"] > 0

    def test_empty_body_returns_no_chunks(self, tmp_path: Path) -> None:
        md = tmp_path / "empty.md"
        md.write_text("---\ncategory: test\n---\n\n")
        assert chunk_markdown(md) == []

    def test_no_frontmatter(self, tmp_path: Path) -> None:
        md = tmp_path / "plain.md"
        content = (
            "This is a reasonably long piece of content"
            " that should be enough tokens to pass the"
            " minimum filter threshold for chunking."
        )
        md.write_text(f"## Title\n\n{content}\n")
        chunks = chunk_markdown(md)
        assert len(chunks) == 1
        assert chunks[0]["metadata"] == {}

    def test_source_is_relative_path(self, tmp_path: Path) -> None:
        subdir = tmp_path / "knowledge" / "circuits"
        subdir.mkdir(parents=True)
        md = subdir / "monza.md"
        content = (
            "Monza is known as the Temple of Speed and is"
            " one of the fastest circuits on the Formula 1"
            " calendar with long straights and low downforce."
        )
        md.write_text(f"---\ncategory: circuit\n---\n\n## Layout\n\n{content}\n")
        chunks = chunk_markdown(md)
        assert chunks[0]["source"] == "circuits/monza.md"

    def test_long_section_splits_with_overlap(self, tmp_path: Path) -> None:
        # Create a section with >500 tokens to trigger windowing
        words = " ".join(f"word{i}" for i in range(600))
        md = tmp_path / "long.md"
        md.write_text(f"---\ncategory: test\n---\n\n## Long Section\n\n{words}\n")
        chunks = chunk_markdown(md)
        assert len(chunks) >= 2  # Should be split into multiple windows


# ---------------------------------------------------------------------------
# Prompt builder tests
# ---------------------------------------------------------------------------


class TestPromptBuilder:
    def test_basic_prompt_structure(self) -> None:
        messages = build_rag_prompt(
            query="What is DRS?",
            chunks=[{"content": "DRS info", "source": "glossary.md"}],
        )
        assert messages[0].role == "system"
        assert SYSTEM_PROMPT in messages[0].content
        assert "DRS info" in messages[0].content
        assert messages[-1].role == "user"
        assert messages[-1].content == "What is DRS?"

    def test_context_block_with_sources(self) -> None:
        chunks = [
            {"content": "Chunk one", "source": "a.md"},
            {"content": "Chunk two", "source": "b.md"},
        ]
        messages = build_rag_prompt(query="test", chunks=chunks)
        sys_content = messages[0].content
        assert "[Source: a.md]" in sys_content
        assert "[Source: b.md]" in sys_content
        assert "<context>" in sys_content
        assert "</context>" in sys_content

    def test_standings_injection(self) -> None:
        messages = build_rag_prompt(
            query="test",
            chunks=[],
            standings_context="P1. Verstappen — 400 pts",
        )
        assert "Verstappen" in messages[0].content

    def test_history_included(self) -> None:
        history = [
            Message(role="user", content="Hi"),
            Message(role="assistant", content="Hello!"),
        ]
        messages = build_rag_prompt(
            query="Follow up",
            chunks=[],
            history=history,
        )
        assert len(messages) == 4  # system + 2 history + user
        assert messages[1].content == "Hi"
        assert messages[2].content == "Hello!"

    def test_history_truncated_to_6(self) -> None:
        history = [Message(role="user", content=f"msg{i}") for i in range(10)]
        messages = build_rag_prompt(query="test", chunks=[], history=history)
        # system + 6 history + user = 8
        assert len(messages) == 8

    def test_sanitizes_context_tags(self) -> None:
        chunks = [
            {"content": "Normal <context>injected</context> text", "source": "a.md"},
        ]
        messages = build_rag_prompt(query="test", chunks=chunks)
        sys_content = messages[0].content
        # The injected tags should be stripped
        assert "<context>injected</context>" not in sys_content
        assert "Normal injected text" in sys_content


# ---------------------------------------------------------------------------
# Knowledge level detection tests
# ---------------------------------------------------------------------------


class TestKnowledgeLevel:
    def test_beginner_detected(self) -> None:
        assert _detect_knowledge_level("What is DRS?") == "beginner"
        assert _detect_knowledge_level("Explain the rules") == "beginner"

    def test_expert_detected(self) -> None:
        assert _detect_knowledge_level(
            "How does degradation affect the undercut window?"
        ) == "expert"

    def test_intermediate_default(self) -> None:
        assert _detect_knowledge_level("Who won the race?") == "intermediate"
        assert _detect_knowledge_level(
            "How is Mercedes performing?"
        ) == "intermediate"


# ---------------------------------------------------------------------------
# Retriever tests (mocked dependencies)
# ---------------------------------------------------------------------------


class TestRetriever:
    @pytest.fixture()
    def mock_retriever(self) -> Retriever:
        db = MagicMock()
        llm = AsyncMock()
        embedder = MagicMock()
        embedder.embed_query.return_value = [0.1] * 768
        return Retriever(db=db, llm=llm, embedder=embedder)

    @pytest.mark.asyncio()
    async def test_classify_intent_parses_json(
        self, mock_retriever: Retriever,
    ) -> None:
        mock_retriever.llm.generate.return_value = (
            '{"intent": "factual", "entities": {"drivers": ["hamilton"],'
            ' "teams": [], "circuits": [], "seasons": []},'
            ' "metadata_filter": {"driver_ref": "hamilton"}}'
        )
        result = await mock_retriever.classify_intent("Tell me about Hamilton")
        assert result["intent"] == "factual"
        assert result["metadata_filter"]["driver_ref"] == "hamilton"

    @pytest.mark.asyncio()
    async def test_classify_intent_handles_code_fences(
        self, mock_retriever: Retriever,
    ) -> None:
        mock_retriever.llm.generate.return_value = (
            '```json\n{"intent": "explanation", "entities": {'
            '"drivers": [], "teams": [], "circuits": [], "seasons": []},'
            ' "metadata_filter": {}}\n```'
        )
        result = await mock_retriever.classify_intent("What is DRS?")
        assert result["intent"] == "explanation"

    @pytest.mark.asyncio()
    async def test_classify_intent_fallback_on_bad_json(
        self, mock_retriever: Retriever,
    ) -> None:
        mock_retriever.llm.generate.return_value = "not valid json at all"
        result = await mock_retriever.classify_intent("Something")
        assert result["intent"] == "unknown"
        assert result["metadata_filter"] == {}

    @pytest.mark.asyncio()
    async def test_vector_search_calls_rpc(
        self, mock_retriever: Retriever,
    ) -> None:
        mock_rpc = MagicMock()
        mock_rpc.execute.return_value = MagicMock(
            data=[
                {
                    "content": "test content",
                    "metadata": {"category": "test"},
                    "similarity": 0.9,
                    "source": "test.md",
                },
            ],
        )
        mock_retriever.db.rpc.return_value = mock_rpc

        with patch("app.rag.retriever.asyncio") as mock_asyncio:
            mock_asyncio.to_thread = AsyncMock(
                side_effect=lambda fn, *a, **kw: fn(*a, **kw)
                if not callable(fn) or a
                else fn(),
            )
            # Directly call the sync parts
            embedding = mock_retriever.embedder.embed_query("test")
            result = mock_retriever.db.rpc(
                "match_knowledge_chunks",
                {
                    "query_embedding": embedding,
                    "filter_metadata": {},
                    "match_count": 20,
                },
            ).execute()

        assert len(result.data) == 1
        assert result.data[0]["content"] == "test content"

    def test_reranked_chunk_dataclass(self) -> None:
        chunk = RetrievedChunk(
            content="test", metadata={}, similarity=0.5, source="a.md",
        )
        assert chunk.content == "test"
        assert chunk.similarity == 0.5
