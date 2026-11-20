"""Notify subscriptions router — captures interest emails for unreleased features."""

import logging
import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from supabase import Client

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notify", tags=["notify"])

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class NotifyRequest(BaseModel):
    email: str
    source: Literal["live", "academy", "predictions"]

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v) or len(v) > 254:
            raise ValueError("Invalid email address")
        return v


class NotifyResponse(BaseModel):
    ok: bool


@router.post("", response_model=NotifyResponse, status_code=status.HTTP_200_OK)
def subscribe(
    body: NotifyRequest,
    db: Annotated[Client, Depends(get_supabase)],
) -> NotifyResponse:
    """Record an email subscription.

    A plain ``def`` because the Supabase client is synchronous: FastAPI runs it
    in its threadpool, so the network call never blocks the event loop.

    Upserts on the unique email constraint so duplicate submissions return the
    same success response without leaking whether the address was already stored.
    """
    try:
        db.table("notify_subscriptions").upsert(
            {"email": body.email, "source": body.source},
            on_conflict="email",
        ).execute()
    except Exception as exc:
        # Never log the address. A PostgREST error's text can echo the failing
        # row, so log only the error's type and code, not its message.
        logger.error(
            "Failed to store subscription source=%s error=%s code=%s",
            body.source,
            type(exc).__name__,
            getattr(exc, "code", None),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not record subscription",
        ) from exc

    logger.info("Subscription recorded source=%s", body.source)
    return NotifyResponse(ok=True)
