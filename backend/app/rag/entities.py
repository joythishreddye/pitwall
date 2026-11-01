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
* comparisons use no filter, and entity searches cover each side;
* a scan of the question trusts only unambiguous names: full names, team and
  circuit names, circuit cities, and refs that aren't also everyday words.
  Weak aliases still repair names the classifier gave, but a scan skips
  them, so a stray word can't filter the answer out. Weak aliases are:
  - country names, including the refs "bahrain" and "monaco";
  - places that are also people or words ("americas", "villeneuve");
  - word-like surnames ("a stroll");
  - "aston".

  A weak circuit alias counts only inside a race name ("Monaco Grand Prix").
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
}
# Weak aliases resolve a name the classifier gives, but a scan of the
# question ignores them ("a stroll around Monza", "Aston Villa").
_WEAK_TEAM_ALIASES = {"aston": "aston_martin"}
_WORD_SURNAMES = frozenset({"stroll", "button", "hill"})
# Circuit refs that are also people or everyday words ("Jacques Villeneuve")
_WORD_CIRCUIT_ALIASES = frozenset(
    {"americas", "villeneuve", "rodriguez", "ricard", "vegas"}
)
# A weak circuit alias still counts as part of a race name ("Monaco GP")
_RACE_NAME_WORDS = ("grand prix", "gp")


def _norm(text: str) -> str:
    """Lowercase, strip accents, and collapse punctuation to single spaces."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.lower()).strip()


@dataclass
class _AliasTable:
    to_ref: dict[str, str] = field(default_factory=dict)
    # Aliases that resolve classifier output but that a scan skips, unless
    # one of ``race_name_words`` follows them
    weak: set[str] = field(default_factory=set)
    race_name_words: tuple[str, ...] = ()
    _ambiguous: set[str] = field(default_factory=set)

    def add(
        self, ref: str, aliases: Iterable[str | None], *, weak: bool = False
    ) -> None:
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
                self.weak.discard(alias)
                self._ambiguous.add(alias)
            elif existing is None:
                self.to_ref[alias] = ref
                if weak:
                    self.weak.add(alias)
            elif not weak:
                # The same entity also uses this alias unambiguously
                # (circuit "monaco" in the country Monaco)
                self.weak.discard(alias)

    def resolve(self, value: object) -> str | None:
        if not isinstance(value, str) or not value.strip():
            return None
        return self.to_ref.get(_norm(value))

    def find_and_strip(self, padded: str) -> tuple[list[str], str]:
        """Find whole-word aliases in space-padded normalized text.

        Weak aliases are skipped unless a race-name word follows them.
        Returns the refs found and the text with those aliases blanked out,
        so a later table can't match inside them ("red bull" in "red bull
        ring"). Longest aliases go first.
        """
        found: list[str] = []
        for alias in sorted(self.to_ref, key=len, reverse=True):
            needle = f" {alias} "
            if needle not in padded:
                continue
            if alias in self.weak and not any(
                f" {alias} {word} " in padded for word in self.race_name_words
            ):
                continue
            ref = self.to_ref[alias]
            if ref not in found:
                found.append(ref)
            padded = padded.replace(needle, " " * len(needle))
        return found, padded


_YEAR = re.compile(r"\b(19[5-9]\d|20[0-9]\d)\b")


@dataclass
class EntityLinker:
    drivers: _AliasTable = field(default_factory=_AliasTable)
    teams: _AliasTable = field(default_factory=_AliasTable)
    circuits: _AliasTable = field(
        default_factory=lambda: _AliasTable(race_name_words=_RACE_NAME_WORDS)
    )
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
                surname = d.get("surname") or ""
                linker.drivers.add(d["ref"], [f"{d.get('forename', '')} {surname}"])
                # The ref is usually the surname too ("stroll")
                for alias in (d["ref"], surname):
                    linker.drivers.add(
                        d["ref"], [alias], weak=_norm(alias) in _WORD_SURNAMES
                    )
        for c in constructors:
            if c["ref"] in kb_teams:
                linker.teams.add(c["ref"], [c["ref"], c.get("name")])
        for alias, ref in _EXTRA_TEAM_ALIASES.items():
            if ref in kb_teams:
                linker.teams.add(ref, [alias])
        for alias, ref in _WEAK_TEAM_ALIASES.items():
            if ref in kb_teams:
                linker.teams.add(ref, [alias], weak=True)

        kb_circuit_rows = [c for c in circuits if c["ref"] in kb_circuits]
        country_counts = Counter(_norm(c.get("country") or "") for c in kb_circuit_rows)
        for c in kb_circuit_rows:
            # A country names its only circuit when the classifier says so,
            # but "Is China a big market?" is not about Shanghai. The same
            # goes for refs that are countries or people ("monaco",
            # "villeneuve").
            country = _norm(c.get("country") or "")
            for alias in (c["ref"], c.get("name"), c.get("location")):
                plain = _norm(alias or "")
                weak = plain in _WORD_CIRCUIT_ALIASES or plain == country
                linker.circuits.add(c["ref"], [alias], weak=weak)
            if country and country_counts[country] == 1:
                linker.circuits.add(c["ref"], [country], weak=True)
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
        """Return a copy of ``intent`` with valid refs and a usable filter.

        Entities come from the classifier, repaired to knowledge-base refs,
        and from unambiguous names in the question (the classifier doesn't
        know the 2026 newcomers). One entity of a kind becomes the filter;
        several mean a comparison, which entity searches cover instead.
        """
        raw_filter = intent.get("metadata_filter")
        raw_filter = raw_filter if isinstance(raw_filter, dict) else {}
        raw_entities = intent.get("entities")
        raw_entities = raw_entities if isinstance(raw_entities, dict) else {}

        named_drivers = _resolve_list(self.drivers, raw_entities.get("drivers"))
        named_teams = _resolve_list(self.teams, raw_entities.get("teams"))
        named_circuits = _resolve_list(self.circuits, raw_entities.get("circuits"))

        # Circuits first, then teams, then drivers, each on what the previous
        # scan left, so "Red Bull Ring" doesn't also mean the Red Bull team.
        text = f" {_norm(question)} "
        found_circuits, text = self.circuits.find_and_strip(text)
        found_teams, text = self.teams.find_and_strip(text)
        found_drivers, _ = self.drivers.find_and_strip(text)

        drivers = _merge(named_drivers, found_drivers)
        teams = _merge(named_teams, found_teams)
        circuits = _merge(named_circuits, found_circuits)

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

        seasons = raw_entities.get("seasons")
        return {
            **intent,
            "metadata_filter": metadata_filter,
            "entities": {
                "drivers": drivers,
                "teams": teams,
                "circuits": circuits,
                "seasons": seasons if isinstance(seasons, list) else [],
            },
        }


def _resolve_list(table: _AliasTable, values: object) -> list[str]:
    """Repair a classifier-provided list of names to known refs."""
    refs: list[str] = []
    for value in values if isinstance(values, list) else []:
        ref = table.resolve(value)
        if ref and ref not in refs:
            refs.append(ref)
    return refs


def _merge(first: list[str], second: list[str]) -> list[str]:
    return first + [ref for ref in second if ref not in first]
