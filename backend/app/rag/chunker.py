"""Markdown chunker with frontmatter parsing and section-aware splitting."""

import logging
import re
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

MIN_TOKENS = 100
MAX_TOKENS = 500
OVERLAP_TOKENS = 50


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
        chunk_words = words[start:end]
        chunk_text = " ".join(chunk_words)
        full = f"{heading}\n\n{chunk_text}" if heading else chunk_text
        chunks.append(full.strip())
        start = end - OVERLAP_TOKENS
        if start + MIN_TOKENS >= len(words):
            break

    return chunks


def chunk_markdown(filepath: Path) -> list[dict]:
    """Parse a Markdown file and return chunks with metadata.

    Returns list of dicts: {content, metadata, token_count, source}.
    """
    raw = filepath.read_text(encoding="utf-8")
    metadata, body = _parse_frontmatter(raw)

    if not body.strip():
        return []

    sections = _split_sections(body)
    source = str(filepath.relative_to(filepath.parents[1]))

    chunks = []
    for heading, section_text in sections:
        for chunk_text in _window_chunks(section_text, heading):
            token_count = _count_tokens(chunk_text)
            if token_count < 20:
                continue
            chunks.append({
                "content": chunk_text,
                "metadata": {**metadata},
                "token_count": token_count,
                "source": source,
            })

    return chunks
