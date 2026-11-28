"""Markdown chunker with frontmatter parsing and section-aware splitting."""

import logging
import re
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

MIN_TOKENS = 100
MAX_TOKENS = 500
OVERLAP_TOKENS = 50
# Chunks shorter than this aren't indexed
MIN_CHUNK_TOKENS = 20


def _count_tokens(text: str) -> int:
    """Approximate token count by whitespace splitting."""
    return len(text.split())


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Extract YAML frontmatter and body from Markdown content."""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if not match:
        return {}, content
    try:
        metadata = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        logger.warning("Failed to parse YAML frontmatter")
        metadata = {}
    body = content[match.end() :]
    return metadata, body


def _split_sections(body: str) -> list[tuple[str, str]]:
    """Split Markdown body on ## headers into (heading, content) pairs."""
    sections: list[tuple[str, str]] = []
    parts = re.split(r"^(## .+)$", body, flags=re.MULTILINE)

    # Text before first ## header
    preamble = parts[0].strip()
    if preamble:
        sections.append(("", preamble))

    # Paired (heading, content) from split results
    for i in range(1, len(parts), 2):
        heading = parts[i].strip()
        content = parts[i + 1].strip() if i + 1 < len(parts) else ""
        if content:
            sections.append((heading, content))

    return sections


def _join(heading: str, text: str, later_heading: str, later_text: str) -> str:
    """``text`` followed by a later section, its heading kept inside."""
    later = f"{later_heading}\n\n{later_text}" if later_heading else later_text
    return f"{text}\n\n{later}"


def _fold_short_sections(
    sections: list[tuple[str, str]],
) -> list[tuple[str, str]]:
    """Join each section too short to index to its neighbour.

    A short section joins the next one, under its own heading; a short last
    section joins the one before. Without this, the chunk floor dropped whole
    sections: every driver doc's overview (current team included), every race
    doc's pit strategy.
    """
    out: list[tuple[str, str]] = []
    carry: tuple[str, str] | None = None
    for heading, text in sections:
        if carry is not None:
            heading, text = carry[0], _join(*carry, heading, text)
            carry = None
        full = f"{heading}\n\n{text}" if heading else text
        if _count_tokens(full) < MIN_CHUNK_TOKENS:
            carry = (heading, text)
        else:
            out.append((heading, text))
    if carry is not None:
        if out:
            out[-1] = (out[-1][0], _join(*out[-1], *carry))
        else:
            out.append(carry)
    return out


def _window_chunks(text: str, heading: str) -> list[str]:
    """Split text into overlapping windows of MAX_TOKENS tokens."""
    words = text.split()
    if len(words) <= MAX_TOKENS:
        full = f"{heading}\n\n{text}" if heading else text
        return [full.strip()]

    chunks = []
    start = 0
    while start < len(words):
        end = min(start + MAX_TOKENS, len(words))
        if end - OVERLAP_TOKENS + MIN_TOKENS > len(words):
            # The next window would be too short: this one takes the rest, so
            # the section's last words are never dropped
            end = len(words)
        chunk_words = words[start:end]
        chunk_text = " ".join(chunk_words)
        full = f"{heading}\n\n{chunk_text}" if heading else chunk_text
        chunks.append(full.strip())
        if end == len(words):
            break
        start = end - OVERLAP_TOKENS

    return chunks


def chunk_markdown(filepath: Path) -> list[dict]:
    """Parse a Markdown file and return chunks with metadata.

    Returns list of dicts: {content, metadata, token_count, source}.
    """
    raw = filepath.read_text(encoding="utf-8")
    metadata, body = _parse_frontmatter(raw)

    if not body.strip():
        return []

    sections = _fold_short_sections(_split_sections(body))
    source = str(filepath.relative_to(filepath.parents[1]))

    chunks = []
    for heading, section_text in sections:
        for chunk_text in _window_chunks(section_text, heading):
            token_count = _count_tokens(chunk_text)
            if token_count < MIN_CHUNK_TOKENS:
                continue
            chunks.append(
                {
                    "content": chunk_text,
                    "metadata": {**metadata},
                    "token_count": token_count,
                    "source": source,
                }
            )

    return chunks
