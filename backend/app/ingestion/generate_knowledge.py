"""Auto-generate knowledge Markdown docs from seeded F1 database.

Generates:
- Driver profiles for the current grid (drivers/ directory)
- Team profiles for all constructors (teams/ directory)
- Race summaries for all races (races/ directory)
"""

import logging
from pathlib import Path

from supabase import Client

logger = logging.getLogger(__name__)

KNOWLEDGE_DIR = Path(__file__).resolve().parents[2] / "knowledge"
CURRENT_SEASON = 2026


def _format_time(ms: int | None) -> str:
    """Convert milliseconds to M:SS.sss format."""
    if not ms:
        return "N/A"
    minutes = ms // 60000
    seconds = (ms % 60000) / 1000
    return f"{minutes}:{seconds:06.3f}"


def _format_gap(ms: int | None, winner_ms: int | None) -> str:
    """Format gap to winner."""
    if not ms or not winner_ms:
        return ""
    gap = (ms - winner_ms) / 1000
    return f"+{gap:.3f}s"


def generate_driver_profiles(supabase: Client) -> int:
    """Generate Markdown profiles for all drivers on the current grid."""
    out_dir = KNOWLEDGE_DIR / "drivers"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Get race IDs for current season
    season_races = (
        supabase.table("races")
        .select("id, season, round, name, date, circuits(name, ref)")
        .eq("season", CURRENT_SEASON)
        .order("round")
        .execute()
    )
    race_ids = [r["id"] for r in season_races.data]
    race_map = {r["id"]: r for r in season_races.data}

    # Fetch results for those races
    current_results_raw = (
        supabase.table("race_results")
        .select(
            "race_id, driver_id, constructor_id, grid, position,"
            " position_text, points, laps, status, time_millis,"
            " fastest_lap_rank,"
            " drivers!inner(id, ref, forename, surname, nationality,"
            " code, dob),"
            " constructors!inner(id, ref, name, nationality)"
        )
        .in_("race_id", race_ids)
        .execute()
    )

    # Attach race info and sort by round
    for row in current_results_raw.data:
        row["races"] = race_map[row["race_id"]]
    current_results_raw.data.sort(
        key=lambda r: r["races"]["round"],
    )

    if not current_results_raw.data:
        logger.warning("No results for season %d", CURRENT_SEASON)
        return 0

    # Group by driver
    drivers: dict[int, dict] = {}
    for row in current_results_raw.data:
        did = row["driver_id"]
        if did not in drivers:
            d = row["drivers"]
            c = row["constructors"]
            drivers[did] = {
                "info": d,
                "team": c,
                "season_results": [],
            }
        drivers[did]["season_results"].append(row)

    # Fetch career stats for all grid drivers
    driver_ids = list(drivers.keys())

    all_results = (
        supabase.table("race_results")
        .select("driver_id, position, points, status")
        .in_("driver_id", driver_ids)
        .execute()
    )

    # Compute career stats
    career: dict[int, dict] = {}
    for did in driver_ids:
        career[did] = {
            "races": 0,
            "wins": 0,
            "podiums": 0,
            "points": 0.0,
        }

    for row in all_results.data:
        did = row["driver_id"]
        if did not in career:
            continue
        career[did]["races"] += 1
        career[did]["points"] += row["points"] or 0
        pos = row["position"]
        if pos == 1:
            career[did]["wins"] += 1
        if pos and pos <= 3:
            career[did]["podiums"] += 1

    # Fetch qualifying poles
    quali_poles = (
        supabase.table("qualifying_results")
        .select("driver_id")
        .in_("driver_id", driver_ids)
        .eq("position", 1)
        .execute()
    )
    poles: dict[int, int] = {}
    for row in quali_poles.data:
        did = row["driver_id"]
        poles[did] = poles.get(did, 0) + 1

    # Fetch championship titles (P1 in final round standings)
    championships: dict[int, int] = {}
    titles = (
        supabase.table("standings")
        .select("entity_id, season, round")
        .eq("type", "driver")
        .eq("position", 1)
        .in_("entity_id", driver_ids)
        .execute()
    )
    # Group by season, take max round
    season_champs: dict[tuple[int, int], int] = {}
    for row in titles.data:
        key = (row["entity_id"], row["season"])
        if key not in season_champs or row["round"] > season_champs[key]:
            season_champs[key] = row["round"]
    for (did, _season), _round in season_champs.items():
        championships[did] = championships.get(did, 0) + 1

    count = 0
    for did, data in drivers.items():
        d = data["info"]
        team = data["team"]
        results = data["season_results"]
        stats = career[did]

        # Season performance
        season_points = sum(r["points"] or 0 for r in results)
        season_wins = sum(1 for r in results if r["position"] == 1)
        season_podiums = sum(
            1 for r in results if r["position"] and r["position"] <= 3
        )
        best_finish = min(
            (r["position"] for r in results if r["position"]),
            default=None,
        )
        dnfs = sum(1 for r in results if r["status"] != "Finished")

        # Recent results (last 5)
        recent = results[-5:]
        recent_lines = []
        for r in recent:
            race = r["races"]
            pos = r["position_text"] if "position_text" in r else str(
                r["position"]
            )
            recent_lines.append(
                f"- Round {race['round']} {race['name']}:"
                f" P{pos} (started P{r['grid']})"
            )

        md = f"""---
category: driver
driver_ref: {d['ref']}
constructor_ref: {team['ref']}
knowledge_level: all
tags:
  - {d['ref']}
  - {team['ref']}
  - {d['nationality'].lower()}
---

# {d['forename']} {d['surname']} — Driver Profile

## Overview

**Full Name:** {d['forename']} {d['surname']}
**Nationality:** {d['nationality']}
**Driver Code:** {d['code']}
**Current Team:** {team['name']} ({CURRENT_SEASON} season)

## Career Statistics

- **Races:** {stats['races']}
- **Wins:** {stats['wins']}
- **Podiums:** {stats['podiums']}
- **Pole Positions:** {poles.get(did, 0)}
- **Career Points:** {stats['points']:.1f}
- **World Championships:** {championships.get(did, 0)}

## {CURRENT_SEASON} Season Performance

- **Points:** {season_points:.0f}
- **Wins:** {season_wins}
- **Podiums:** {season_podiums}
- **Best Finish:** P{best_finish if best_finish else 'N/A'}
- **DNFs:** {dnfs}
- **Races Completed:** {len(results)}

## Recent Results ({CURRENT_SEASON})

{chr(10).join(recent_lines)}
"""
        filepath = out_dir / f"{d['ref']}.md"
        filepath.write_text(md.strip() + "\n", encoding="utf-8")
        count += 1
        logger.info("  Driver: %s %s → %s", d["forename"], d["surname"], filepath.name)

    return count


def generate_team_profiles(supabase: Client) -> int:
    """Generate Markdown profiles for all constructors."""
    out_dir = KNOWLEDGE_DIR / "teams"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Get constructor standings for current season
    standings = (
        supabase.table("standings")
        .select("entity_id, position, points, wins, season, round")
        .eq("type", "constructor")
        .eq("season", CURRENT_SEASON)
        .order("round", desc=True)
        .execute()
    )

    if not standings.data:
        logger.warning("No constructor standings for %d", CURRENT_SEASON)
        return 0

    # Get latest round
    max_round = max(r["round"] for r in standings.data)
    latest = [r for r in standings.data if r["round"] == max_round]

    # Get constructor info
    constructor_ids = [r["entity_id"] for r in latest]
    constructors = (
        supabase.table("constructors")
        .select("id, ref, name, nationality")
        .in_("id", constructor_ids)
        .execute()
    )
    cmap = {c["id"]: c for c in constructors.data}

    # Get current season race IDs
    season_races = (
        supabase.table("races")
        .select("id")
        .eq("season", CURRENT_SEASON)
        .execute()
    )
    season_race_ids = [r["id"] for r in season_races.data]

    # Get current season results per constructor
    season_results = (
        supabase.table("race_results")
        .select(
            "constructor_id, driver_id, position, points, status,"
            " drivers!inner(ref, forename, surname, code)"
        )
        .in_("race_id", season_race_ids)
        .in_("constructor_id", constructor_ids)
        .execute()
    )

    # Group results by constructor
    team_results: dict[int, list] = {cid: [] for cid in constructor_ids}
    team_drivers: dict[int, set] = {cid: set() for cid in constructor_ids}
    for row in season_results.data:
        cid = row["constructor_id"]
        team_results[cid].append(row)
        d = row["drivers"]
        team_drivers[cid].add(
            f"{d['forename']} {d['surname']} ({d['code']})"
        )

    # Career stats per constructor
    all_career = (
        supabase.table("race_results")
        .select("constructor_id, position, points")
        .in_("constructor_id", constructor_ids)
        .execute()
    )
    career_stats: dict[int, dict] = {
        cid: {"races": 0, "wins": 0, "podiums": 0, "points": 0.0}
        for cid in constructor_ids
    }
    for row in all_career.data:
        cid = row["constructor_id"]
        if cid not in career_stats:
            continue
        career_stats[cid]["races"] += 1
        career_stats[cid]["points"] += row["points"] or 0
        pos = row["position"]
        if pos == 1:
            career_stats[cid]["wins"] += 1
        if pos and pos <= 3:
            career_stats[cid]["podiums"] += 1

    count = 0
    for stand in sorted(latest, key=lambda r: r["position"]):
        cid = stand["entity_id"]
        c = cmap.get(cid)
        if not c:
            continue

        results = team_results.get(cid, [])
        drivers_list = sorted(team_drivers.get(cid, set()))
        cs = career_stats.get(cid, {})

        # Season breakdown
        season_podiums = sum(
            1 for r in results if r["position"] and r["position"] <= 3
        )
        season_dnfs = sum(
            1 for r in results if r["status"] != "Finished"
        )

        # Per-driver breakdown
        driver_breakdown: dict[str, dict] = {}
        for r in results:
            d = r["drivers"]
            name = f"{d['forename']} {d['surname']}"
            if name not in driver_breakdown:
                driver_breakdown[name] = {
                    "points": 0, "best": 99, "races": 0,
                }
            driver_breakdown[name]["points"] += r["points"] or 0
            driver_breakdown[name]["races"] += 1
            if r["position"] and r["position"] < driver_breakdown[name]["best"]:
                driver_breakdown[name]["best"] = r["position"]

        driver_lines = []
        for name, stats in sorted(
            driver_breakdown.items(), key=lambda x: -x[1]["points"],
        ):
            best = stats["best"] if stats["best"] < 99 else "N/A"
            driver_lines.append(
                f"- **{name}:** {stats['points']:.0f} pts,"
                f" best P{best} in {stats['races']} races"
            )

        md = f"""---
category: team
constructor_ref: {c['ref']}
knowledge_level: all
tags:
  - {c['ref']}
  - {c['nationality'].lower()}
  - constructors-championship
---

# {c['name']} — Team Profile

## Overview

**Full Name:** {c['name']}
**Nationality:** {c['nationality']}
**{CURRENT_SEASON} Drivers:** {', '.join(drivers_list)}

## {CURRENT_SEASON} Season Performance

- **Championship Position:** P{stand['position']}
- **Points:** {stand['points']}
- **Wins:** {stand['wins']}
- **Podiums:** {season_podiums}
- **DNFs:** {season_dnfs}

## {CURRENT_SEASON} Driver Breakdown

{chr(10).join(driver_lines)}

## Career Statistics (in database)

- **Race Entries:** {cs.get('races', 0)}
- **Wins:** {cs.get('wins', 0)}
- **Podiums:** {cs.get('podiums', 0)}
- **Total Points:** {cs.get('points', 0):.1f}
"""
        filepath = out_dir / f"{c['ref']}.md"
        filepath.write_text(md.strip() + "\n", encoding="utf-8")
        count += 1
        logger.info("  Team: %s → %s", c["name"], filepath.name)

    return count


def generate_race_summaries(supabase: Client) -> int:
    """Generate Markdown summaries for all races in the database."""
    out_dir = KNOWLEDGE_DIR / "races"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Fetch all races
    races = (
        supabase.table("races")
        .select("id, season, round, name, date, circuits(name, ref)")
        .order("season")
        .order("round")
        .execute()
    )

    if not races.data:
        logger.warning("No races found")
        return 0

    # Fetch all results in batches by season to avoid huge queries
    all_race_ids = [r["id"] for r in races.data]

    # Process in batches of 50 races
    batch_size = 50
    results_by_race: dict[int, list] = {rid: [] for rid in all_race_ids}

    for i in range(0, len(all_race_ids), batch_size):
        batch_ids = all_race_ids[i : i + batch_size]
        batch_results = (
            supabase.table("race_results")
            .select(
                "race_id, driver_id, constructor_id, grid, position,"
                " position_text, points, laps, status, time_millis,"
                " fastest_lap_rank,"
                " drivers!inner(ref, forename, surname, code),"
                " constructors!inner(ref, name)"
            )
            .in_("race_id", batch_ids)
            .order("position")
            .execute()
        )
        for row in batch_results.data:
            results_by_race[row["race_id"]].append(row)

    # Fetch pit stops per race
    pit_data: dict[int, list] = {rid: [] for rid in all_race_ids}
    for i in range(0, len(all_race_ids), batch_size):
        batch_ids = all_race_ids[i : i + batch_size]
        pits = (
            supabase.table("pit_stops")
            .select(
                "race_id, driver_id, stop_number, lap, duration_ms,"
                " drivers!inner(code, surname)"
            )
            .in_("race_id", batch_ids)
            .execute()
        )
        for row in pits.data:
            pit_data[row["race_id"]].append(row)

    count = 0
    for race in races.data:
        rid = race["id"]
        results = results_by_race.get(rid, [])
        if not results:
            continue

        circuit = race.get("circuits") or {}
        circuit_name = circuit.get("name", "Unknown Circuit")
        circuit_ref = circuit.get("ref", "unknown")

        # Sort by position
        finished = [r for r in results if r["position"] is not None]
        finished.sort(key=lambda r: r["position"])
        dnfs = [r for r in results if r["status"] != "Finished"]

        if not finished:
            continue

        winner = finished[0]
        podium = finished[:3]
        winner_time = winner.get("time_millis")

        # Podium lines
        podium_lines = []
        for r in podium:
            d = r["drivers"]
            c = r["constructors"]
            gap = _format_gap(r["time_millis"], winner_time)
            grid_delta = (r["grid"] or 0) - (r["position"] or 0)
            delta_str = (
                f"(+{grid_delta} places)"
                if grid_delta > 0
                else f"({grid_delta} places)"
                if grid_delta < 0
                else "(same as grid)"
            )
            podium_lines.append(
                f"- **P{r['position']}:** {d['forename']} {d['surname']}"
                f" ({c['name']}) — started P{r['grid']}"
                f" {delta_str} {gap}"
            )

        # Biggest movers (gained most positions)
        movers = []
        for r in finished:
            if r["grid"] and r["position"]:
                gain = r["grid"] - r["position"]
                if gain >= 3:
                    d = r["drivers"]
                    movers.append(
                        f"- {d['forename']} {d['surname']}:"
                        f" P{r['grid']} → P{r['position']}"
                        f" (+{gain} places)"
                    )
        movers.sort(
            key=lambda x: -int(x.split("+")[1].split(" ")[0]),
        )

        # DNF lines
        dnf_lines = []
        for r in dnfs:
            d = r["drivers"]
            dnf_lines.append(
                f"- {d['forename']} {d['surname']}:"
                f" {r['status']} (started P{r['grid']})"
            )

        # Fastest lap
        fl_holder = None
        for r in finished:
            if r.get("fastest_lap_rank") == 1:
                d = r["drivers"]
                fl_holder = f"{d['forename']} {d['surname']}"
                break

        # Pit stop summary
        pits = pit_data.get(rid, [])
        pit_summary = ""
        if pits:
            # Count stops per driver
            driver_stops: dict[str, int] = {}
            for p in pits:
                code = p["drivers"]["code"]
                driver_stops[code] = max(
                    driver_stops.get(code, 0), p["stop_number"],
                )
            one_stop = sum(1 for v in driver_stops.values() if v == 1)
            two_stop = sum(1 for v in driver_stops.values() if v == 2)
            three_plus = sum(1 for v in driver_stops.values() if v >= 3)
            parts = []
            if one_stop:
                parts.append(f"{one_stop} drivers on 1-stop")
            if two_stop:
                parts.append(f"{two_stop} on 2-stop")
            if three_plus:
                parts.append(f"{three_plus} on 3+ stops")
            pit_summary = ", ".join(parts) if parts else "No pit data"

        # Driver refs for metadata
        driver_refs = [r["drivers"]["ref"] for r in podium]
        constructor_refs = list(
            {r["constructors"]["ref"] for r in podium}
        )

        w = winner["drivers"]
        wc = winner["constructors"]

        md = f"""---
category: race
season: {race['season']}
round: {race['round']}
circuit_ref: {circuit_ref}
driver_refs:
{chr(10).join(f'  - {ref}' for ref in driver_refs)}
constructor_refs:
{chr(10).join(f'  - {ref}' for ref in constructor_refs)}
knowledge_level: all
tags:
  - {circuit_ref}
  - {race['season']}-season
---

# {race['name']} {race['season']} — Race Summary

**Date:** {race['date']}
**Circuit:** {circuit_name}
**Winner:** {w['forename']} {w['surname']} ({wc['name']})
**Winner Time:** {_format_time(winner_time)}
**Fastest Lap:** {fl_holder or 'N/A'}

## Podium

{chr(10).join(podium_lines)}

## Full Results (Top 10)

"""
        # Top 10
        for r in finished[:10]:
            d = r["drivers"]
            c = r["constructors"]
            pts = f"{r['points']:.0f} pts" if r["points"] else "0 pts"
            md += (
                f"| P{r['position']} | {d['forename']} {d['surname']}"
                f" | {c['name']} | {pts} |\n"
            )

        if movers:
            md += f"\n## Biggest Movers\n\n{chr(10).join(movers[:5])}\n"

        if dnf_lines:
            md += f"\n## Retirements/DNFs\n\n{chr(10).join(dnf_lines)}\n"

        if pit_summary:
            md += f"\n## Pit Strategy\n\n{pit_summary}\n"

        filename = (
            f"{race['season']}-r{race['round']:02d}-{circuit_ref}.md"
        )
        filepath = out_dir / filename
        filepath.write_text(md.strip() + "\n", encoding="utf-8")
        count += 1

    logger.info("  Generated %d race summaries", count)
    return count


def generate_all(supabase: Client) -> dict[str, int]:
    """Generate all knowledge documents."""
    results = {}

    logger.info("Generating driver profiles...")
    results["drivers"] = generate_driver_profiles(supabase)

    logger.info("Generating team profiles...")
    results["teams"] = generate_team_profiles(supabase)

    logger.info("Generating race summaries...")
    results["races"] = generate_race_summaries(supabase)

    total = sum(results.values())
    logger.info(
        "Total generated: %d docs (%d drivers, %d teams, %d races)",
        total,
        results["drivers"],
        results["teams"],
        results["races"],
    )
    return results
