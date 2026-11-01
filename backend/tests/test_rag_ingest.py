"""Knowledge ingestion swaps chunk sets safely."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.ingestion import rag_ingest


class FakeTable:
    """Just enough of the Supabase table API for the swap logic."""

    def __init__(
        self,
        existing_ids: list[int],
        fail_on_batch: int | None = None,
        flaky_deletes: int = 0,
    ):
        self.ids = list(existing_ids)
        self.flaky_deletes = flaky_deletes
        self.next_id = max(existing_ids, default=0) + 1
        self.inserts = 0
        self.fail_on_batch = fail_on_batch
        self._op: tuple | None = None

    # Builder methods record the operation and return self
    def select(self, *_a, **_k):
        self._op = ("select",)
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def range(self, start, end):
        self._op = ("select_range", start, end)
        return self

    def insert(self, rows):
        self._op = ("insert", rows)
        return self

    def delete(self):
        self._op = ("delete",)
        return self

    def in_(self, _col, values):
        self._op = ("delete_in", values)
        return self

    def execute(self):
        op = self._op
        if op[0] == "select":  # latest id
            return MagicMock(data=[{"id": max(self.ids)}] if self.ids else [])
        if op[0] == "select_range":
            _, start, end = op
            page = [{"id": i} for i in sorted(self.ids)][start : end + 1]
            return MagicMock(data=page)
        if op[0] == "insert":
            self.inserts += 1
            if self.fail_on_batch is not None and self.inserts >= self.fail_on_batch:
                raise RuntimeError("canceling statement due to statement timeout")
            for _ in op[1]:
                self.ids.append(self.next_id)
                self.next_id += 1
            return MagicMock(data=[])
        if op[0] == "delete_in":
            if self.flaky_deletes:
                self.flaky_deletes -= 1
                raise RuntimeError("canceling statement due to statement timeout")
            doomed = set(op[1])
            self.ids = [i for i in self.ids if i not in doomed]
            return MagicMock(data=[])
        raise AssertionError(f"unexpected op {op}")


def _run(table: FakeTable, n_chunks: int) -> int:
    chunks = [
        {"content": f"c{i}", "metadata": {}, "token_count": 5, "source": "x.md"}
        for i in range(n_chunks)
    ]
    supabase = MagicMock()
    supabase.table.return_value = table
    embedder = MagicMock()
    embedder.embed_documents.side_effect = lambda texts: [[0.0] * 768 for _ in texts]
    with (
        patch.object(rag_ingest.Embedder, "get", return_value=embedder),
        patch.object(rag_ingest, "chunk_markdown", return_value=chunks),
        patch.object(
            rag_ingest, "KNOWLEDGE_DIR", MagicMock(rglob=lambda _: [Path("only.md")])
        ),
        patch.object(rag_ingest.time, "sleep"),
    ):
        return rag_ingest.run_rag_ingest(supabase)


def test_new_set_replaces_the_old_one() -> None:
    table = FakeTable(existing_ids=list(range(1, 51)))

    assert _run(table, n_chunks=250) == 250
    assert len(table.ids) == 250
    assert min(table.ids) > 50  # every old row is gone


def test_a_failed_insert_keeps_the_old_set_serving() -> None:
    table = FakeTable(existing_ids=list(range(1, 51)), fail_on_batch=2)

    with pytest.raises(RuntimeError, match="statement timeout"):
        _run(table, n_chunks=250)

    assert sorted(table.ids) == list(range(1, 51))


def test_a_timed_out_delete_is_retried() -> None:
    table = FakeTable(existing_ids=list(range(1, 51)), flaky_deletes=1)

    assert _run(table, n_chunks=120) == 120
    assert len(table.ids) == 120
    assert min(table.ids) > 50
