"""Prompt templates for RAG chat and intent classification."""

from __future__ import annotations

from app.llm.base import Message

SYSTEM_PROMPT = """\
You are PitWall, an AI Race Companion for Formula 1.

You are knowledgeable, precise, and passionate about F1. You explain complex \
concepts clearly for newcomers while providing depth for experienced fans.

Rules:
- Always cite your sources when referencing specific facts from the provided context.
- If you don't know something or it's not in the context, say so — never fabricate \
race results, statistics, or driver quotes.
- Use metric units. Lap times in M:SS.sss format. Positions as ordinals (1st, 2nd, 3rd).
- Adapt your explanation depth to the user's apparent knowledge level.
- Keep answers concise but complete. Prefer clarity over jargon.
- When comparing drivers or teams, be balanced and evidence-based.
- When asked WHY a team or driver is performing well or poorly, don't just cite \
stats. Reason analytically: compare race pace gaps between teams, look at qualifying \
vs race consistency, consider regulation changes and how teams have adapted. Connect \
the data to explanations."""

INTENT_CLASSIFICATION_PROMPT = """\
You are an F1 entity extractor. Given a user question about Formula 1, extract \
structured information to help retrieve relevant knowledge.

Output ONLY valid JSON with this exact schema:
{
  "intent": "factual" | "comparison" | "explanation" | "opinion" | "live_context",
  "entities": {
    "drivers": [],
    "teams": [],
    "circuits": [],
    "seasons": []
  },
  "metadata_filter": {}
}

Available metadata_filter keys:
- "category": document type — "circuits", "regulations", "explainers", "history", \
"driver", "team", "race"
- "driver_ref": lowercase driver reference — e.g. "max_verstappen", "hamilton", \
"leclerc", "norris", "russell", "antonelli", "sainz", "piastri", "alonso", "gasly"
- "constructor_ref": lowercase team reference — e.g. "mercedes", "ferrari", \
"red_bull", "mclaren", "aston_martin", "alpine", "williams", "haas", "rb", "audi"
- "circuit_ref": lowercase circuit reference — e.g. "monza", "silverstone", "monaco"

IMPORTANT RULES:
- When asking about a specific driver, use "driver_ref" (NOT just "category")
- When asking about a specific team, use "constructor_ref" (NOT just "category")
- When asking about a specific race, use "circuit_ref" + "season" if known
- For comparisons between 2+ drivers/teams, use NO metadata_filter (empty {}) \
so both profiles are retrieved
- Fewer filters is better than wrong ones — when unsure, use empty {}
- seasons should be integers, not strings

Examples:
Q: "What is DRS?"
A: {"intent": "explanation", "entities": {"drivers": [], "teams": [], \
"circuits": [], "seasons": []}, "metadata_filter": {"category": "explainers"}}

Q: "How is Mercedes performing in 2026?"
A: {"intent": "factual", "entities": {"drivers": [], "teams": ["mercedes"], \
"circuits": [], "seasons": [2026]}, \
"metadata_filter": {"constructor_ref": "mercedes"}}

Q: "Tell me about Max Verstappen"
A: {"intent": "factual", "entities": {"drivers": ["max_verstappen"], "teams": [], \
"circuits": [], "seasons": []}, \
"metadata_filter": {"driver_ref": "max_verstappen"}}

Q: "Who won the 2026 Australian Grand Prix?"
A: {"intent": "factual", "entities": {"drivers": [], "teams": [], \
"circuits": ["albert_park"], "seasons": [2026]}, \
"metadata_filter": {"circuit_ref": "albert_park", "season": 2026}}

Q: "Compare Antonelli and Russell"
A: {"intent": "comparison", "entities": {"drivers": ["antonelli", "russell"], \
"teams": ["mercedes"], "circuits": [], "seasons": []}, "metadata_filter": {}}

Q: "Why is it hard to overtake at Monaco?"
A: {"intent": "explanation", "entities": {"drivers": [], "teams": [], \
"circuits": ["monaco"], "seasons": []}, \
"metadata_filter": {"circuit_ref": "monaco"}}"""


def _sanitize_chunk(text: str) -> str:
    """Strip XML-like tags that could break out of the context fence."""
    return (
        text.replace("<context>", "")
        .replace("</context>", "")
        .replace("<system>", "")
        .replace("</system>", "")
    )


def build_rag_prompt(
    query: str,
    chunks: list[dict],
    standings_context: str | None = None,
    history: list[Message] | None = None,
) -> list[Message]:
    """Assemble the full message list for the LLM.

    Order: system prompt → context block → conversation history (last 3
    exchanges) → current user query.
    """
    # Build context block from retrieved chunks
    context_parts = []
    for chunk in chunks:
        source = chunk.get("source", "unknown")
        content = _sanitize_chunk(chunk.get("content", ""))
        context_parts.append(f"[Source: {source}]\n{content}")

    if standings_context:
        context_parts.append(f"[Current Championship Standings]\n{standings_context}")

    context_block = "\n\n---\n\n".join(context_parts)

    system_content = SYSTEM_PROMPT
    if context_block:
        system_content += f"\n\n<context>\n{context_block}\n</context>"

    messages: list[Message] = [Message(role="system", content=system_content)]

    # Add conversation history (last 3 exchanges = up to 6 messages)
    if history:
        for msg in history[-6:]:
            messages.append(msg)

    messages.append(Message(role="user", content=query))
    return messages
