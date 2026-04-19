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
async def subscribe(
    body: NotifyRequest,
    db: Annotated[Client, Depends(get_supabase)],
) -> NotifyResponse:
    """Record an email subscription.

    Upserts on the unique email constraint so duplicate submissions return the
    same success response without leaking whether the address was already stored.
    """
    try:
        db.table("notify_subscriptions").upsert(
            {"email": body.email, "source": body.source},
            on_conflict="email",
        ).execute()
    except Exception as exc:
        logger.exception("Failed to store subscription email=%s", body.email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not record subscription",
        ) from exc

    logger.info("Subscription recorded source=%s", body.source)
    return NotifyResponse(ok=True)
