"""Driver photo links: OpenF1's driver lists to the static file, and back."""

import importlib.util
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from app.headshots import (
    headshot_url,
    is_photo_link,
    links_by_round,
    season_file,
)
from app.schedule import load_schedule, schedule_from_jolpica

_BASE = "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website"
NOR = f"{_BASE}/drivers/L/LANNOR01_Lando_Norris/lannor01.png.transform/1col/image.png"
TSU = f"{_BASE}/drivers/Y/YUKTSU01_Yuki_Tsunoda/yuktsu01.png.transform/1col/image.png"
TSU_NEW = TSU.replace("1col", "2col")


def _row(code: str, link: object) -> dict:
    return {"name_acronym": code, "headshot_url": link}


def test_each_driver_in_a_race_gets_one_link() -> None:
    rounds = links_by_round(
        {
            12: [_row("NOR", NOR), _row("TSU", TSU)],
            13: [_row("NOR", NOR), _row("TSU", None)],
        }
    )

    assert rounds == {12: {"NOR": NOR, "TSU": TSU}, 13: {"NOR": NOR, "TSU": TSU}}


def test_a_missing_link_comes_from_the_nearest_round_and_the_earlier_on_a_tie() -> None:
    tie = links_by_round(
        {10: [_row("TSU", TSU)], 12: [_row("TSU", None)], 14: [_row("TSU", TSU_NEW)]}
    )
    nearer = links_by_round(
        {10: [_row("TSU", TSU)], 13: [_row("TSU", None)], 14: [_row("TSU", TSU_NEW)]}
    )

    assert tie[12]["TSU"] == TSU
    assert nearer[13]["TSU"] == TSU_NEW


def test_a_driver_with_no_photo_all_season_gets_none() -> None:
    rounds = links_by_round({20: [_row("CAM", None)], 21: [_row("CAM", "")]})

    assert rounds == {20: {"CAM": None}, 21: {"CAM": None}}


@pytest.mark.parametrize(
    "link",
    [
        "http://media.formula1.com/drivers/x.png",
        "https://media.formula1.com.example.org/drivers/x.png",
        "https://example.org/media.formula1.com/x.png",
        "https://media.formula1.com/x.png?next=https://example.org",
        "https://media.formula1.com/x y.png",
        "javascript:alert(1)",
        "",
        None,
        42,
    ],
)
def test_only_f1_media_links_are_kept(link: object) -> None:
    assert not is_photo_link(link)
    assert links_by_round({1: [_row("NOR", link)]}) == {1: {"NOR": None}}


@pytest.mark.parametrize(
    ("rows", "message"),
    [
        ([_row("NOR", NOR), _row("NOR", NOR)], "NOR listed twice"),
        ([_row("nor", NOR)], "bad driver code"),
        ([{"headshot_url": NOR}], "bad driver code"),
    ],
)
def test_a_bad_or_repeated_driver_code_is_refused(rows: list, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        links_by_round({1: rows})


def _no_repeats(pairs: list[tuple[str, object]]) -> dict:
    keys = [k for k, _ in pairs]
    assert len(keys) == len(set(keys)), f"repeated key in {keys}"
    return dict(pairs)


def test_the_shipped_2026_file_gives_each_driver_one_link() -> None:
    path = Path(__file__).resolve().parents[1] / "app" / "data" / "headshots"
    data = json.loads((path / "2026.json").read_text(), object_pairs_hook=_no_repeats)
    rounds = data["rounds"]

    assert data["season"] == 2026
    # OpenF1 lists a race's drivers ahead of it, but a race further off may have
    # none yet: the file holds the schedule's rounds from round 1 on, every race
    # already run among them
    schedule = load_schedule(2026)
    assert [int(r) for r in rounds] == [r.round for r in schedule][: len(rounds)]
    run = [r.round for r in schedule if r.race.date < datetime.now(UTC).date()]
    assert set(run) <= {int(r) for r in rounds}
    linked = {c for d in rounds.values() for c, link in d.items() if link}
    for rnd, drivers in rounds.items():
        assert len(drivers) >= 20, f"round {rnd}"
        for code, link in drivers.items():
            # One link each, or none only for a driver with no photo all season
            assert is_photo_link(link) or (link is None and code not in linked)
    assert headshot_url(2026, 21, "NOR", path) == NOR


def _write(folder: Path, season: int, rounds: dict) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{season}.json").write_text(json.dumps(season_file(season, rounds)))
    return folder


def test_a_link_comes_from_its_round_or_the_latest_earlier_one(tmp_path: Path) -> None:
    folder = _write(
        tmp_path,
        2026,
        {20: {"NOR": NOR, "TSU": TSU}, 21: {"NOR": NOR, "CAM": None}},
    )

    assert headshot_url(2026, 21, "NOR", folder) == NOR
    # TSU sat out round 21, and race week before round 22 has no round 22 yet
    assert headshot_url(2026, 21, "TSU", folder) == TSU
    assert headshot_url(2026, 22, "TSU", folder) == TSU
    assert headshot_url(2026, 19, "NOR", folder) is None
    assert headshot_url(2026, 21, "CAM", folder) is None
    assert headshot_url(2026, 21, "XYZ", folder) is None
    assert headshot_url(2027, 1, "NOR", folder) is None


@pytest.mark.parametrize(
    ("season_in_file", "rounds", "message"),
    [
        (2026, {"1": {"NOR": "https://example.org/x.png"}}, "bad entry for 'NOR'"),
        (2026, {"1": {"nor": NOR}}, "bad entry for 'nor'"),
        (2025, {"1": {"NOR": NOR}}, "season 2025, not 2026"),
        (2026, {"0": {"NOR": NOR}}, "round '0' isn't a round"),
        (2026, {"-1": {"NOR": NOR}, "2": {"NOR": NOR}}, "round '-1' isn't a round"),
        (2026, {"1": {"NOR": NOR}, "01": {"NOR": None}}, "round '01' isn't a round"),
        (2026, {" 2": {"NOR": NOR}}, "round ' 2' isn't a round"),
        (2026, {"1": None}, "round '1' isn't a round"),
        (2026, [], "not a season file"),
    ],
)
def test_a_file_with_a_bad_entry_is_refused(
    tmp_path: Path, season_in_file: int, rounds: dict, message: str
) -> None:
    folder = tmp_path / f"bad-{season_in_file}-{len(message)}"
    folder.mkdir()
    body = {"season": season_in_file, "source": "test", "rounds": rounds}
    (folder / "2026.json").write_text(json.dumps(body))

    with pytest.raises(ValueError, match=message):
        headshot_url(2026, 1, "NOR", folder)


@pytest.mark.parametrize(
    ("rounds_json", "message"),
    [
        (f'{{"1": {{"NOR": "{NOR}", "NOR": null}}}}', "repeated key 'NOR'"),
        (f'{{"1": {{"NOR": "{NOR}"}}, "1": {{"NOR": null}}}}', "repeated key '1'"),
    ],
)
def test_a_file_that_repeats_a_driver_or_a_round_is_refused(
    tmp_path: Path, rounds_json: str, message: str
) -> None:
    folder = tmp_path / message.replace(" ", "-").replace("'", "")
    folder.mkdir()
    text = f'{{"season": 2026, "source": "test", "rounds": {rounds_json}}}'
    (folder / "2026.json").write_text(text)

    with pytest.raises(ValueError, match=message):
        headshot_url(2026, 1, "NOR", folder)


def _fetch_headshots():
    """scripts/fetch_headshots.py, which isn't a package, loaded by path."""
    if "fetch_headshots" in sys.modules:
        return sys.modules["fetch_headshots"]
    path = Path(__file__).resolve().parents[1] / "scripts" / "fetch_headshots.py"
    spec = importlib.util.spec_from_file_location("fetch_headshots", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["fetch_headshots"] = module
    spec.loader.exec_module(module)
    return module


def _race(rnd: int, day: str) -> dict:
    return {
        "season": "2026",
        "round": str(rnd),
        "raceName": f"Race {rnd}",
        "Circuit": {"circuitId": f"circuit_{rnd}"},
        "date": day,
        "time": "13:00:00Z",
    }


def _schedule(folder: Path) -> Path:
    races = [_race(1, "2026-03-08"), _race(2, "2026-03-15"), _race(3, "2026-03-29")]
    folder.mkdir()
    (folder / "2026.json").write_text(json.dumps(schedule_from_jolpica(2026, races)))
    return folder


# OpenF1's 2026 races: Sakhir was dropped from the calendar but stays in OpenF1
SESSIONS = [
    {"session_key": 11245, "date_start": "2026-03-15T07:00:00+00:00"},
    {"session_key": 11234, "date_start": "2026-03-08T04:00:00+00:00"},
    {"session_key": 11253, "date_start": "2026-03-29T05:00:00+00:00"},
    {"session_key": 11261, "date_start": "2026-04-12T15:00:00+00:00"},
]


def _openf1(answers: dict[str, httpx.Response]) -> tuple[httpx.Client, list[str]]:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        key = request.url.params.get("session_key", "sessions")
        return answers[key]

    return httpx.Client(transport=httpx.MockTransport(handler)), seen


def _args(tmp_path: Path) -> list[str]:
    schedule = _schedule(tmp_path / "schedule")
    out = tmp_path / "out"
    return ["--season", "2026", "--out-dir", str(out), "--schedule-dir", str(schedule)]


def test_the_script_matches_races_to_rounds_by_date_and_writes_the_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    script = _fetch_headshots()
    pauses: list[float] = []
    monkeypatch.setattr(script.time, "sleep", pauses.append)
    client, seen = _openf1(
        {
            "sessions": httpx.Response(200, json=SESSIONS),
            "11234": httpx.Response(200, json=[_row("NOR", NOR), _row("TSU", TSU)]),
            "11245": httpx.Response(200, json=[_row("NOR", NOR), _row("TSU", None)]),
            "11253": httpx.Response(200, json=[_row("TSU", TSU)]),
        }
    )

    assert script.main(_args(tmp_path), client) == 0
    assert seen[0] == ("https://api.openf1.org/v1/sessions?year=2026&session_name=Race")
    # Sakhir's race (no round on its date) is never asked for
    assert not any("11261" in url for url in seen)
    # One pause before each driver list, long enough for 30 requests a minute
    assert len(pauses) == len(seen) - 1
    # (29 at most in any 60 s, under OpenF1's 30)
    assert all(p * 29 > 60 for p in pauses)
    written = json.loads((tmp_path / "out" / "2026.json").read_text())
    assert written["rounds"] == {
        "1": {"NOR": NOR, "TSU": TSU},
        "2": {"NOR": NOR, "TSU": TSU},
        # Only the drivers in round 3's race (NOR missed it)
        "3": {"TSU": TSU},
    }
    assert written["source"].startswith("OpenF1")


def test_the_script_writes_nothing_while_a_live_session_locks_openf1(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    script = _fetch_headshots()
    monkeypatch.setattr(script.time, "sleep", lambda _: None)
    client, _ = _openf1(
        {
            "sessions": httpx.Response(200, json=SESSIONS),
            "11234": httpx.Response(200, json=[_row("NOR", NOR)]),
            "11245": httpx.Response(401, json={"detail": "live session"}),
        }
    )

    assert script.main(_args(tmp_path), client) == 1
    assert not (tmp_path / "out" / "2026.json").exists()


def test_the_script_stops_on_any_other_openf1_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    script = _fetch_headshots()
    monkeypatch.setattr(script.time, "sleep", lambda _: None)
    client, _ = _openf1(
        {
            "sessions": httpx.Response(200, json=SESSIONS),
            "11234": httpx.Response(404, json={"detail": "Not Found"}),
        }
    )

    with pytest.raises(httpx.HTTPStatusError):
        script.main(_args(tmp_path), client)
    assert not (tmp_path / "out" / "2026.json").exists()


def test_an_answer_that_isnt_a_list_stops_the_script_and_keeps_the_old_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    script = _fetch_headshots()
    monkeypatch.setattr(script.time, "sleep", lambda _: None)
    old = tmp_path / "out" / "2026.json"
    old.parent.mkdir()
    old.write_text("the last good file")
    client, _ = _openf1(
        {
            "sessions": httpx.Response(200, json=SESSIONS),
            "11234": httpx.Response(200, json=[_row("NOR", NOR)]),
            "11245": httpx.Response(200, json={"drivers": []}),
            "11253": httpx.Response(200, json=[_row("NOR", NOR)]),
        }
    )

    with pytest.raises(ValueError, match="expected a list"):
        script.main(_args(tmp_path), client)
    assert old.read_text() == "the last good file"


def test_a_run_round_that_matches_no_openf1_race_stops_the_script(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Round 2's date in the schedule is a day off OpenF1's race (a local date)
    script = _fetch_headshots()
    monkeypatch.setattr(script.time, "sleep", lambda _: None)
    shifted = [s for s in SESSIONS if s["session_key"] != 11245]
    shifted.append({"session_key": 11245, "date_start": "2026-03-16T07:00:00+00:00"})
    client, seen = _openf1({"sessions": httpx.Response(200, json=shifted)})

    with pytest.raises(ValueError, match=r"rounds \[2\]"):
        script.main(_args(tmp_path), client)
    assert len(seen) == 1
    assert not (tmp_path / "out" / "2026.json").exists()


def test_a_round_not_yet_run_may_match_no_race(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The day after round 1, OpenF1 doesn't list round 2's race yet
    script = _fetch_headshots()
    monkeypatch.setattr(script.time, "sleep", lambda _: None)
    opener = [s for s in SESSIONS if s["session_key"] == 11234]
    client, _ = _openf1(
        {
            "sessions": httpx.Response(200, json=opener),
            "11234": httpx.Response(200, json=[_row("NOR", NOR)]),
        }
    )
    days = {"2026-03-08": 1, "2026-03-15": 2}

    entries = script.fetch_entries(2026, days, client, today=script.date(2026, 3, 9))

    assert list(entries) == [1]


def test_a_round_not_yet_run_may_have_no_drivers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Before round 3, its race is listed but has no drivers yet: OpenF1 answers
    # 404 when nothing matches (checked 2026-11-26)
    script = _fetch_headshots()
    monkeypatch.setattr(script.time, "sleep", lambda _: None)
    client, _ = _openf1(
        {
            "sessions": httpx.Response(200, json=SESSIONS),
            "11234": httpx.Response(200, json=[_row("NOR", NOR)]),
            "11245": httpx.Response(200, json=[_row("NOR", NOR)]),
            "11253": httpx.Response(404, json={"detail": "No results found."}),
        }
    )
    days = {"2026-03-08": 1, "2026-03-15": 2, "2026-03-29": 3}

    entries = script.fetch_entries(2026, days, client, today=script.date(2026, 3, 20))

    assert list(entries) == [1, 2]


def test_a_run_round_with_no_drivers_stops_the_script_and_keeps_the_old_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Round 3 has run, but OpenF1 lost its driver list: writing the file without
    # it would drop the round
    script = _fetch_headshots()
    monkeypatch.setattr(script.time, "sleep", lambda _: None)
    old = tmp_path / "out" / "2026.json"
    old.parent.mkdir()
    old.write_text("the last good file")
    client, _ = _openf1(
        {
            "sessions": httpx.Response(200, json=SESSIONS),
            "11234": httpx.Response(200, json=[_row("NOR", NOR)]),
            "11245": httpx.Response(200, json=[_row("NOR", NOR)]),
            "11253": httpx.Response(404, json={"detail": "No results found."}),
        }
    )

    with pytest.raises(ValueError, match=r"no OpenF1 drivers for rounds \[3\]"):
        script.main(_args(tmp_path), client)
    assert old.read_text() == "the last good file"


def test_a_write_that_fails_part_way_leaves_the_old_file_whole(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    script = _fetch_headshots()
    monkeypatch.setattr(script.time, "sleep", lambda _: None)
    old = tmp_path / "out" / "2026.json"
    old.parent.mkdir()
    old.write_text("the last good file")
    args = _args(tmp_path)
    client, _ = _openf1(
        {
            "sessions": httpx.Response(200, json=SESSIONS),
            "11234": httpx.Response(200, json=[_row("NOR", NOR)]),
            "11245": httpx.Response(200, json=[_row("NOR", NOR)]),
            "11253": httpx.Response(200, json=[_row("NOR", NOR)]),
        }
    )

    def half_then_full_disk(self: Path, data: str, *args: object, **kw: object):
        with open(self, "w", encoding="utf-8") as f:
            f.write(data[: len(data) // 2])
        raise OSError("disk full")

    monkeypatch.setattr(script.Path, "write_text", half_then_full_disk)
    with pytest.raises(OSError, match="disk full"):
        script.main(args, client)
    monkeypatch.undo()

    assert old.read_text() == "the last good file"
    assert [p.name for p in old.parent.iterdir()] == ["2026.json"]


def test_the_script_needs_the_seasons_schedule_file(tmp_path: Path) -> None:
    script = _fetch_headshots()
    client, seen = _openf1({})
    empty = tmp_path / "no-schedule"
    empty.mkdir()
    args = [
        "--season",
        "2026",
        "--out-dir",
        str(tmp_path),
        "--schedule-dir",
        str(empty),
    ]

    assert script.main(args, client) == 1
    assert seen == []
    assert not (tmp_path / "2026.json").exists()
