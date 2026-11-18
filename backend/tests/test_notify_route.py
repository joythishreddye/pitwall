"""Notify endpoint: stores the email off the event loop and hides DB errors."""

import threading
from collections.abc import Iterator
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.supabase import get_supabase
from app.main import app


@pytest.fixture
def db() -> Iterator[MagicMock]:
    fake = MagicMock()
    app.dependency_overrides[get_supabase] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


async def _post(payload: dict):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/v1/notify", json=payload)


async def test_upserts_the_email_off_the_event_loop_thread(db: MagicMock) -> None:
    loop_thread = threading.get_ident()
    seen: list[int] = []
    db.table.return_value.upsert.return_value.execute.side_effect = lambda: seen.append(
        threading.get_ident()
    )

    response = await _post({"email": " Fan@Example.com ", "source": "live"})

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    db.table.assert_called_once_with("notify_subscriptions")
    db.table.return_value.upsert.assert_called_once_with(
        {"email": "fan@example.com", "source": "live"}, on_conflict="email"
    )
    assert seen and seen[0] != loop_thread


async def test_a_database_error_returns_500_without_details(db: MagicMock) -> None:
    db.table.return_value.upsert.return_value.execute.side_effect = RuntimeError(
        "connection refused"
    )

    response = await _post({"email": "fan@example.com", "source": "academy"})

    assert response.status_code == 500
    assert response.json() == {"detail": "Could not record subscription"}


async def test_rejects_an_invalid_email(db: MagicMock) -> None:
    response = await _post({"email": "not-an-email", "source": "live"})

    assert response.status_code == 422
    db.table.assert_not_called()
