"""Map the intent classifier's entities onto refs the knowledge base actually uses.

The classifier is a language model. It writes "lando_norris" where the
documents say "norris" and "singapore" where they say "marina_bay", and it
misses newer names (Lindblad, Cadillac, Madring) entirely. A metadata filter on
a ref no document carries returns nothing, and retrieval quietly falls back to
generic results. The linker repairs refs deterministically from the database
catalog and spots entities the classifier missed.

It also enforces the filter rules the eval baseline supports:

* never filter on ``category`` alone (it hid the regulations docs);
* keep ``season`` only alongside a circuit (profiles carry no season);
* no race or circuit filter for years before the first season the knowledge
  base covers (its race docs start in 2018, so "Suzuka in 1989" lives in
  the history docs);
* comparisons use no filter, and entity searches cover each side.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field

from supabase import Client

from app.db.supabase import fetch_all

logger = logging.getLogger(__name__)

# Aliases shorter than this cause false matches in free text ("rb", "per")
_MIN_ALIAS_LEN = 4
_SHORT_ALIASES = frozenset({"spa"})
_EXTRA_TEAM_ALIASES = {
    "racing bulls": "rb",
    "red bull racing": "red_bull",
    "aston": "aston_martin",
}


def _norm(text: str) -> str:
    """Lowercase, strip accents, and collapse punctuation to single spaces."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.lower()).strip()


@dataclass
class _AliasTable:
    to_ref: dict[str, str] = field(default_factory=dict)
    _ambiguous: set[str] = field(default_factory=set)

    def add(self, ref: str, aliases: Iterable[str | None]) -> None:
        for raw in aliases:
            if not raw:
                continue
            alias = _norm(raw)
            if len(alias) < _MIN_ALIAS_LEN and alias not in _SHORT_ALIASES:
                if alias != _norm(ref):
                    continue
            if alias in self._ambiguous:
                continue
            existing = self.to_ref.get(alias)
            if existing and existing != ref:
                # Two entities share this alias: trust neither
                del self.to_ref[alias]
                self._ambiguous.add(alias)
            else:
                self.to_ref[alias] = ref

    def resolve(self, value: object) -> str | None:
        if not isinstance(value, str) or not value.strip():
            return None
        return self.to_ref.get(_norm(value))

    def find_in(self, text: str) -> list[str]:
        """Refs whose aliases appear as whole words in normalized ``text``."""
        padded = f" {text} "
        found: list[str] = []
        # Longest aliases first, so "red bull racing" wins over "red bull"
        for alias in sorted(self.to_ref, key=len, reverse=True):
            ref = self.to_ref[alias]
            if ref not in found and f" {alias} " in padded:
                found.append(ref)
        return found


_YEAR = re.compile(r"\b(19[5-9]\d|20[0-9]\d)\b")


@dataclass
class EntityLinker:
    drivers: _AliasTable = field(default_factory=_AliasTable)
    teams: _AliasTable = field(default_factory=_AliasTable)
    circuits: _AliasTable = field(default_factory=_AliasTable)
    # Earliest season with race documents; older questions skip race filters
    first_season: int = 2018

    @classmethod
    def from_rows(
        cls,
        kb_metadata: Iterable[dict],
        drivers: Iterable[dict],
        constructors: Iterable[dict],
        circuits: Iterable[dict],
    ) -> EntityLinker:
        """Build alias tables for the refs that knowledge documents carry."""
        kb_drivers: set[str] = set()
        kb_teams: set[str] = set()
        kb_circuits: set[str] = set()
        seasons: set[int] = set()
        for meta in kb_metadata:
            if isinstance(meta.get("season"), int):
                seasons.add(meta["season"])
            if meta.get("driver_ref"):
                kb_drivers.add(meta["driver_ref"])
            if meta.get("constructor_ref"):
                kb_teams.add(meta["constructor_ref"])
            if meta.get("circuit_ref"):
                kb_circuits.add(meta["circuit_ref"])

        linker = cls(first_season=min(seasons) if seasons else 2018)
        for d in drivers:
            if d["ref"] in kb_drivers:
                full = f"{d.get('forename', '')} {d.get('surname', '')}"
                linker.drivers.add(d["ref"], [d["ref"], d.get("surname"), full])
        for c in constructors:
            if c["ref"] in kb_teams:
                linker.teams.add(c["ref"], [c["ref"], c.get("name")])
        for alias, ref in _EXTRA_TEAM_ALIASES.items():
            if ref in kb_teams:
                linker.teams.add(ref, [alias])

        kb_circuit_rows = [c for c in circuits if c["ref"] in kb_circuits]
        country_counts = Counter(_norm(c.get("country") or "") for c in kb_circuit_rows)
        for c in kb_circuit_rows:
            aliases = [c["ref"], c.get("name"), c.get("location")]
            country = _norm(c.get("country") or "")
            if country and country_counts[country] == 1:
                aliases.append(country)
            linker.circuits.add(c["ref"], aliases)
        return linker

    @classmethod
    def from_db(cls, db: Client) -> EntityLinker:
        """Read the knowledge-base refs and entity names from Supabase."""
        meta = fetch_all(
            lambda: db.table("knowledge_chunks").select("id, metadata").order("id")
        )
        drivers = fetch_all(
            lambda: db.table("drivers").select("id, ref, forename, surname").order("id")
        )
        constructors = (
            db.table("constructors").select("id, ref, name").limit(1000).execute().data
        )
        circuits = (
            db.table("circuits")
            .select("id, ref, name, location, country")
            .limit(1000)
            .execute()
            .data
        )
        linker = cls.from_rows(
            (row.get("metadata") or {} for row in meta),
            drivers,
            constructors,
            circuits,
        )
        logger.info(
            "Entity linker ready: %d driver, %d team, %d circuit aliases",
            len(linker.drivers.to_ref),
            len(linker.teams.to_ref),
            len(linker.circuits.to_ref),
        )
        return linker

    def link(self, intent: dict, question: str) -> dict:
        """Return a copy of ``intent`` with valid refs and a usable filter."""
        raw_filter = intent.get("metadata_filter") or {}
        raw_entities = intent.get("entities") or {}
        text = _norm(question)

        drivers = self._resolve_all(self.drivers, raw_entities.get("drivers"), text)
        teams = self._resolve_all(self.teams, raw_entities.get("teams"), text)
        circuits = self._resolve_all(self.circuits, raw_entities.get("circuits"), text)

        circuit_ref = self.circuits.resolve(raw_filter.get("circuit_ref")) or (
            circuits[0] if len(circuits) == 1 else None
        )
        driver_ref = self.drivers.resolve(raw_filter.get("driver_ref")) or (
            drivers[0] if len(drivers) == 1 else None
        )
        team_ref = self.teams.resolve(raw_filter.get("constructor_ref")) or (
            teams[0] if len(teams) == 1 else None
        )

        season = raw_filter.get("season")
        years = [int(y) for y in _YEAR.findall(question)]
        if isinstance(season, int):
            years.append(season)
        if any(y < self.first_season for y in years):
            # No race docs that old: let unfiltered search find the history
            circuit_ref = None

        metadata_filter: dict = {}
        if circuit_ref:
            metadata_filter["circuit_ref"] = circuit_ref
            if isinstance(season, int):
                metadata_filter["season"] = season
        elif driver_ref and len(drivers) <= 1:
            metadata_filter["driver_ref"] = driver_ref
        elif team_ref and len(teams) <= 1 and not drivers:
            metadata_filter["constructor_ref"] = team_ref

        return {
            **intent,
            "metadata_filter": metadata_filter,
            "entities": {
                "drivers": drivers,
                "teams": teams,
                "circuits": circuits,
                "seasons": raw_entities.get("seasons") or [],
            },
        }

    @staticmethod
    def _resolve_all(table: _AliasTable, values: object, text: str) -> list[str]:
        refs: list[str] = []
        for value in values if isinstance(values, list) else []:
            ref = table.resolve(value)
            if ref and ref not in refs:
                refs.append(ref)
        for ref in table.find_in(text):
            if ref not in refs:
                refs.append(ref)
        return refs
