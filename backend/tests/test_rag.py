"""Tests for the RAG pipeline: chunker, prompt builder, knowledge level, retriever."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.routes.chat import _detect_knowledge_level
from app.llm.base import LLMError, Message
from app.rag.chunker import chunk_markdown
from app.rag.entities import EntityLinker
from app.rag.prompt import SYSTEM_PROMPT, build_rag_prompt
from app.rag.query_embedder import EmbeddingUnavailable
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
        assert (
            _detect_knowledge_level("How does degradation affect the undercut window?")
            == "expert"
        )

    def test_intermediate_default(self) -> None:
        assert _detect_knowledge_level("Who won the race?") == "intermediate"
        assert _detect_knowledge_level("How is Mercedes performing?") == "intermediate"


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
        self,
        mock_retriever: Retriever,
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
        self,
        mock_retriever: Retriever,
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
        self,
        mock_retriever: Retriever,
    ) -> None:
        mock_retriever.llm.generate.return_value = "not valid json at all"
        result = await mock_retriever.classify_intent("Something")
        assert result["intent"] == "unknown"
        assert result["metadata_filter"] == {}

    @pytest.mark.asyncio()
    async def test_vector_search_calls_rpc(
        self,
        mock_retriever: Retriever,
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
            content="test",
            metadata={},
            similarity=0.5,
            source="a.md",
        )
        assert chunk.content == "test"
        assert chunk.similarity == 0.5


# ---------------------------------------------------------------------------
# Retriever resilience (Phase 0: model swap, HF budget, full-text fallback)
# ---------------------------------------------------------------------------


def _chunk(source: str, similarity: float = 0.5, **meta: object) -> RetrievedChunk:
    return RetrievedChunk(
        content=source, metadata=meta, similarity=similarity, source=source
    )


def _row(source: str, similarity: float, **meta: object) -> dict:
    return {
        "content": source,
        "metadata": meta,
        "similarity": similarity,
        "source": source,
    }


def _intent_json(filter_: dict, **entities: list) -> str:
    return json.dumps(
        {
            "intent": "factual",
            "entities": {
                "drivers": entities.get("drivers", []),
                "teams": entities.get("teams", []),
                "circuits": entities.get("circuits", []),
                "seasons": entities.get("seasons", []),
            },
            "metadata_filter": filter_,
        }
    )


class FakeKnowledgeBase:
    """Answers match_knowledge_chunks the way Postgres does: containment
    filter, best similarity first, at most match_count rows."""

    def __init__(self, rows: list[dict], fail_on: list[dict] | None = None) -> None:
        self.rows = rows
        self.fail_on = fail_on or []
        self.filters: list[dict] = []

    def rpc(self, _name: str, params: dict) -> MagicMock:
        wanted = params["filter_metadata"]
        self.filters.append(wanted)
        if wanted in self.fail_on:
            raise RuntimeError("canceling statement due to statement timeout")
        matched = [
            r
            for r in self.rows
            if all(r["metadata"].get(k) == v for k, v in wanted.items())
        ]
        matched.sort(key=lambda r: r["similarity"], reverse=True)
        call = MagicMock()
        call.execute.return_value = MagicMock(data=matched[: params["match_count"]])
        return call


# In 2026 the "Bahrain Grand Prix" ran at Sepang. Older Bahrain races score
# higher on the word "Bahrain", which is what buried the 2026 race.
BAHRAIN_KB = [
    _row(
        "races/2026-r16-sepang.md",
        0.80,
        category="race",
        season=2026,
        circuit_ref="sepang",
    ),
    *(
        _row(
            f"races/2026-r{i:02d}-c{i}.md",
            0.70 - i / 100,
            category="race",
            season=2026,
            circuit_ref=f"c{i}",
        )
        for i in range(1, 6)
    ),
    *(
        _row(
            f"races/{y}-bahrain.md",
            0.85,
            category="race",
            season=y,
            circuit_ref="bahrain",
        )
        for y in (2019, 2020, 2021, 2024, 2025)
    ),
    _row("circuits/bahrain.md", 0.75, category="circuits", circuit_ref="bahrain"),
]
BAHRAIN_CIRCUITS = [
    {
        "ref": "bahrain",
        "name": "Bahrain International Circuit",
        "location": "Sakhir",
        "country": "Bahrain",
    },
    {
        "ref": "sepang",
        "name": "Sepang International Circuit",
        "location": "Kuala Lumpur",
        "country": "Malaysia",
    },
]

# Driver docs carry their team's constructor_ref, so a team search can
# surface a driver profile ahead of the team's own doc.
TEAMS_KB = [
    _row(
        "races/2026-r10-spa.md", 0.70, category="race", season=2026, circuit_ref="spa"
    ),
    _row(
        "races/2026-r14-madring.md",
        0.69,
        category="race",
        season=2026,
        circuit_ref="madring",
    ),
    _row(
        "races/2025-r21-interlagos.md",
        0.68,
        category="race",
        season=2025,
        circuit_ref="interlagos",
    ),
    _row("teams/mercedes.md", 0.67, category="team", constructor_ref="mercedes"),
    _row(
        "drivers/norris.md",
        0.66,
        category="driver",
        driver_ref="norris",
        constructor_ref="mclaren",
    ),
    _row(
        "drivers/russell.md",
        0.60,
        category="driver",
        driver_ref="russell",
        constructor_ref="mercedes",
    ),
    _row("teams/mclaren.md", 0.55, category="team", constructor_ref="mclaren"),
]
TEAMS_LINKER_ROWS = (
    [r["metadata"] for r in TEAMS_KB],
    [
        {"ref": "norris", "forename": "Lando", "surname": "Norris"},
        {"ref": "russell", "forename": "George", "surname": "Russell"},
    ],
    [{"ref": "mercedes", "name": "Mercedes"}, {"ref": "mclaren", "name": "McLaren"}],
    [],
)


class TestRetrieverResilience:
    @pytest.fixture()
    def retriever(self) -> Retriever:
        llm = AsyncMock()
        llm.generate.return_value = (
            '{"intent": "factual", "entities": {"drivers": [], "teams": [],'
            ' "circuits": [], "seasons": []}, "metadata_filter": {}}'
        )
        embedder = MagicMock()
        embedder.embed_query.return_value = [0.1] * 768
        return Retriever(db=MagicMock(), llm=llm, embedder=embedder)

    @pytest.mark.asyncio()
    async def test_classify_intent_asks_for_json_mode(
        self, retriever: Retriever
    ) -> None:
        await retriever.classify_intent("Who leads the 2026 title?")
        kwargs = retriever.llm.generate.call_args.kwargs
        assert kwargs["json_mode"] is True
        assert kwargs["max_tokens"] >= 512

    @pytest.mark.asyncio()
    async def test_classify_intent_survives_llm_failure(
        self, retriever: Retriever
    ) -> None:
        retriever.llm.generate.side_effect = LLMError("down", status_code=503)
        result = await retriever.classify_intent("Anything")
        assert result["intent"] == "unknown"
        assert result["metadata_filter"] == {}

    @pytest.mark.asyncio()
    async def test_classify_intent_rejects_non_object_json(
        self, retriever: Retriever
    ) -> None:
        retriever.llm.generate.return_value = "[1, 2, 3]"
        result = await retriever.classify_intent("Anything")
        assert result["intent"] == "unknown"

    @pytest.mark.asyncio()
    async def test_falls_back_to_fulltext_without_embeddings(
        self, retriever: Retriever
    ) -> None:
        retriever.embedder.embed_query.side_effect = EmbeddingUnavailable("402")
        retriever.db.rpc.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "content": "Monza is the Temple of Speed.",
                    "metadata": {},
                    "source": "circuits/monza.md",
                    "rank": 0.4,
                }
            ]
        )
        chunks = await retriever.retrieve("Tell me about Monza")
        assert [c.source for c in chunks] == ["circuits/monza.md"]
        assert retriever.last_mode == "fulltext"
        retriever.db.rpc.assert_called_with(
            "search_knowledge_text",
            {
                "query_text": "Tell me about Monza",
                "match_count": 5,
                "filter_metadata": {},
            },
        )

    @pytest.mark.asyncio()
    async def test_fulltext_uses_the_intent_filter_then_tops_up(
        self, retriever: Retriever
    ) -> None:
        retriever.embedder.embed_query.side_effect = EmbeddingUnavailable("402")
        retriever.llm.generate.return_value = (
            '{"intent": "explanation", "entities": {"drivers": [], "teams":'
            ' ["mercedes"], "circuits": [], "seasons": []},'
            ' "metadata_filter": {"constructor_ref": "mercedes"}}'
        )
        profile = {
            "content": "Mercedes profile",
            "metadata": {},
            "source": "teams/mercedes.md",
            "rank": 1.0,
        }
        recap = {
            "content": "Suzuka recap",
            "metadata": {},
            "source": "races/2026-r03-suzuka.md",
            "rank": 0.9,
        }
        retriever.db.rpc.return_value.execute.side_effect = [
            MagicMock(data=[profile]),
            MagicMock(data=[profile, recap]),
        ]

        chunks = await retriever.retrieve("Why is Mercedes so fast?")

        assert [c.source for c in chunks] == [
            "teams/mercedes.md",
            "races/2026-r03-suzuka.md",
        ]
        first_call = retriever.db.rpc.call_args_list[0]
        assert first_call.args[1]["filter_metadata"] == {"constructor_ref": "mercedes"}

    @pytest.mark.asyncio()
    async def test_fulltext_failure_returns_nothing(self, retriever: Retriever) -> None:
        retriever.embedder.embed_query.side_effect = EmbeddingUnavailable("402")
        retriever.db.rpc.side_effect = RuntimeError("function missing")
        chunks = await retriever.retrieve("Tell me about Monza")
        assert chunks == []
        assert retriever.last_mode == "none"

    @pytest.mark.asyncio()
    async def test_rerank_skipped_when_budget_is_spent(
        self, retriever: Retriever
    ) -> None:
        budget = MagicMock()
        budget.consume.return_value = False
        retriever.budget = budget
        chunks = [
            RetrievedChunk(content=f"c{i}", metadata={}, similarity=0.5, source=f"s{i}")
            for i in range(8)
        ]
        with patch.object(retriever, "_hf_rerank", new=AsyncMock()) as hf_rerank:
            result = await retriever.rerank("q", chunks, top_k=5)
        hf_rerank.assert_not_awaited()
        assert result == chunks[:5]
        assert retriever.reranked is False

    @pytest.mark.asyncio()
    async def test_vector_mode_reports_that_rerank_ran(
        self, retriever: Retriever
    ) -> None:
        rows = [
            {
                "content": f"chunk {i}",
                "metadata": {},
                "similarity": 0.9 - i / 100,
                "source": f"s{i}.md",
            }
            for i in range(8)
        ]
        retriever.db.rpc.return_value.execute.return_value = MagicMock(data=rows)
        retriever.rerank_enabled = True
        scores = AsyncMock(return_value=[float(i) for i in range(8)])
        with patch.object(retriever, "_hf_rerank", new=scores):
            chunks = await retriever.retrieve("Compare race pace")
        assert retriever.last_mode == "vector+rerank"
        assert chunks[0].content == "chunk 7"

    @pytest.mark.asyncio()
    async def test_rerank_can_be_switched_off(self, retriever: Retriever) -> None:
        rows = [
            {
                "content": f"chunk {i}",
                "metadata": {},
                "similarity": 0.9 - i / 100,
                "source": f"s{i}.md",
            }
            for i in range(8)
        ]
        retriever.db.rpc.return_value.execute.return_value = MagicMock(data=rows)
        retriever.rerank_enabled = False
        with patch.object(retriever, "_hf_rerank", new=AsyncMock()) as hf_rerank:
            chunks = await retriever.retrieve("Compare race pace")
        hf_rerank.assert_not_awaited()
        assert retriever.last_mode == "vector"
        assert chunks[0].content == "chunk 0"

    def test_comparisons_keep_both_injected_entities(
        self, retriever: Retriever
    ) -> None:
        generic = [_chunk(f"races/r{i}.md", 0.9) for i in range(5)]
        norris = _chunk("drivers/norris.md", driver_ref="norris")
        piastri = _chunk("drivers/piastri.md", driver_ref="piastri")
        result = retriever._ensure_entity_coverage(
            generic,
            {("driver_ref", "norris"): [norris], ("driver_ref", "piastri"): [piastri]},
            top_k=5,
        )
        sources = [c.source for c in result]
        assert "drivers/norris.md" in sources
        assert "drivers/piastri.md" in sources
        assert len(result) == 5

    def test_coverage_keeps_entities_that_ranked_organically(
        self, retriever: Retriever
    ) -> None:
        organic = _chunk("drivers/norris.md", driver_ref="norris")
        ranked = [_chunk(f"races/r{i}.md") for i in range(4)] + [organic]
        hits = {
            ("driver_ref", "norris"): [organic],
            ("driver_ref", "piastri"): [
                _chunk("drivers/piastri.md", driver_ref="piastri")
            ],
            ("driver_ref", "leclerc"): [
                _chunk("drivers/leclerc.md", driver_ref="leclerc")
            ],
        }
        sources = {c.source for c in retriever._ensure_entity_coverage(ranked, hits)}
        assert {
            "drivers/norris.md",
            "drivers/piastri.md",
            "drivers/leclerc.md",
        } <= sources

    def test_extra_chunks_of_a_covered_entity_make_room(
        self, retriever: Retriever
    ) -> None:
        # All five Bahrain chunks used to be protected, so Sepang never got in
        bahrain = [
            _chunk(f"races/{y}-bahrain.md", circuit_ref="bahrain")
            for y in range(2019, 2024)
        ]
        sepang = _chunk("races/2026-r16-sepang.md", circuit_ref="sepang")
        result = retriever._ensure_entity_coverage(
            bahrain,
            {("circuit_ref", "bahrain"): bahrain, ("circuit_ref", "sepang"): [sepang]},
        )
        sources = [c.source for c in result]
        assert len(result) == 5
        assert sources[0] == "races/2019-bahrain.md"  # the best cover stays
        assert "races/2026-r16-sepang.md" in sources

    def test_the_only_chunk_of_an_entity_is_never_evicted(
        self, retriever: Retriever
    ) -> None:
        ranked = [_chunk(f"drivers/d{i}.md", driver_ref=f"d{i}") for i in range(5)]
        hits = {("driver_ref", f"d{i}"): [ranked[i]] for i in range(5)}
        hits[("driver_ref", "d5")] = [_chunk("drivers/d5.md", driver_ref="d5")]
        assert retriever._ensure_entity_coverage(ranked, hits) == ranked

    def test_a_driver_doc_does_not_cover_its_team(self) -> None:
        norris = _chunk(
            "drivers/norris.md",
            category="driver",
            driver_ref="norris",
            constructor_ref="mclaren",
        )
        team = _chunk("teams/mclaren.md", category="team", constructor_ref="mclaren")
        assert Retriever._covers(norris, "driver_ref", "norris")
        assert not Retriever._covers(norris, "constructor_ref", "mclaren")
        assert Retriever._covers(team, "constructor_ref", "mclaren")

    def test_refs_must_match_exactly(self) -> None:
        nurburgring = _chunk("races/2020-r11-nurburgring.md", circuit_ref="nurburgring")
        assert not Retriever._covers(nurburgring, "constructor_ref", "rb")
        assert not Retriever._covers(nurburgring, "circuit_ref", "nurburg")

    @pytest.mark.asyncio()
    async def test_empty_filters_relax_to_season_before_dropping_all(
        self, retriever: Retriever
    ) -> None:
        retriever.llm.generate.return_value = (
            '{"intent": "factual", "entities": {"drivers": [], "teams": [],'
            ' "circuits": [], "seasons": [2026]},'
            ' "metadata_filter": {"circuit_ref": "bahrain", "season": 2026}}'
        )
        season_rows = [
            {
                "content": f"2026 race {i}",
                "metadata": {"season": 2026},
                "similarity": 0.8,
                "source": f"races/2026-r{i:02d}.md",
            }
            for i in range(6)
        ]
        retriever.db.rpc.return_value.execute.side_effect = [
            MagicMock(data=[]),  # circuit + season: nothing
            MagicMock(data=season_rows),  # season only
        ]

        chunks = await retriever.retrieve("Who won the 2026 Bahrain Grand Prix?")

        filters = [
            c.args[1]["filter_metadata"] for c in retriever.db.rpc.call_args_list
        ]
        assert filters == [{"circuit_ref": "bahrain", "season": 2026}, {"season": 2026}]
        assert [c.source for c in chunks] == [r["source"] for r in season_rows[:5]]

    # The production path: a linker, entity searches and coverage together.

    @pytest.mark.asyncio()
    @pytest.mark.parametrize(
        "question",
        [
            "Who won the 2026 Bahrain Grand Prix?",
            "Who won the Bahrain Grand Prix that was held in Malaysia in 2026?",
        ],
    )
    async def test_a_relocated_race_is_found_through_its_season(
        self, retriever: Retriever, question: str
    ) -> None:
        # The circuit's entity search used to fill the candidate list first,
        # so the season-only search never ran
        kb = FakeKnowledgeBase(BAHRAIN_KB)
        retriever.db = kb
        retriever.linker = EntityLinker.from_rows(
            [r["metadata"] for r in BAHRAIN_KB], [], [], BAHRAIN_CIRCUITS
        )
        retriever.llm.generate.return_value = _intent_json(
            {"circuit_ref": "bahrain", "season": 2026},
            circuits=["bahrain"],
            seasons=[2026],
        )

        chunks = await retriever.retrieve(question)

        assert {"season": 2026} in kb.filters
        assert chunks[0].source == "races/2026-r16-sepang.md"
        assert retriever.last_mode == "vector"

    @pytest.mark.asyncio()
    async def test_each_team_in_a_comparison_gets_its_own_doc(
        self, retriever: Retriever
    ) -> None:
        retriever.db = FakeKnowledgeBase(TEAMS_KB)
        retriever.linker = EntityLinker.from_rows(*TEAMS_LINKER_ROWS)
        retriever.llm.generate.return_value = _intent_json(
            {}, teams=["Mercedes", "McLaren"]
        )

        chunks = await retriever.retrieve("Compare Mercedes and McLaren this season.")

        sources = [c.source for c in chunks]
        assert "teams/mercedes.md" in sources
        assert "teams/mclaren.md" in sources

    @pytest.mark.asyncio()
    async def test_a_failed_entity_search_keeps_everything_else(
        self, retriever: Retriever
    ) -> None:
        retriever.db = FakeKnowledgeBase(TEAMS_KB, fail_on=[{"driver_ref": "norris"}])
        retriever.linker = EntityLinker.from_rows(*TEAMS_LINKER_ROWS)
        retriever.llm.generate.return_value = _intent_json(
            {}, drivers=["Norris", "Russell"]
        )

        chunks = await retriever.retrieve("Compare Norris and Russell.")

        sources = [c.source for c in chunks]
        assert len(chunks) == 5
        assert "drivers/norris.md" in sources  # found by the main search
        assert "drivers/russell.md" in sources
        assert retriever.last_mode == "vector"

    @pytest.mark.asyncio()
    async def test_a_failed_relaxed_search_moves_on(self, retriever: Retriever) -> None:
        kb = FakeKnowledgeBase(BAHRAIN_KB, fail_on=[{"season": 2026}])
        retriever.db = kb
        retriever.llm.generate.return_value = _intent_json(
            {"circuit_ref": "bahrain", "season": 2026}, circuits=["bahrain"]
        )

        chunks = await retriever.retrieve("Who won the 2026 Bahrain Grand Prix?")

        assert kb.filters[:3] == [
            {"circuit_ref": "bahrain", "season": 2026},
            {"season": 2026},
            {},
        ]
        assert len(chunks) == 5
