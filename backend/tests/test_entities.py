"""EntityLinker: repairing classifier refs against the knowledge-base catalog.

Each case mirrors a miss from the first eval baseline (2026-11-01).
"""

from app.rag.entities import EntityLinker

KB = [
    {"driver_ref": "norris", "constructor_ref": "mclaren"},
    {"driver_ref": "piastri", "constructor_ref": "mclaren"},
    {"driver_ref": "bearman", "constructor_ref": "haas"},
    {"driver_ref": "arvid_lindblad", "constructor_ref": "rb"},
    {"driver_ref": "max_verstappen", "constructor_ref": "red_bull"},
    {"constructor_ref": "cadillac"},
    {"circuit_ref": "marina_bay"},
    {"circuit_ref": "madring"},
    {"circuit_ref": "catalunya"},
    {"circuit_ref": "suzuka"},
    {"category": "regulations"},
]
DRIVERS = [
    {"ref": "norris", "forename": "Lando", "surname": "Norris"},
    {"ref": "piastri", "forename": "Oscar", "surname": "Piastri"},
    {"ref": "bearman", "forename": "Oliver", "surname": "Bearman"},
    {"ref": "arvid_lindblad", "forename": "Arvid", "surname": "Lindblad"},
    {"ref": "max_verstappen", "forename": "Max", "surname": "Verstappen"},
    # No knowledge doc, so it must not claim the "verstappen" alias
    {"ref": "verstappen", "forename": "Jos", "surname": "Verstappen"},
]
TEAMS = [
    {"ref": "mclaren", "name": "McLaren"},
    {"ref": "haas", "name": "Haas F1 Team"},
    {"ref": "rb", "name": "RB F1 Team"},
    {"ref": "red_bull", "name": "Red Bull"},
    {"ref": "cadillac", "name": "Cadillac"},
]
CIRCUITS = [
    {
        "ref": "marina_bay",
        "name": "Marina Bay Street Circuit",
        "location": "Marina Bay",
        "country": "Singapore",
    },
    {"ref": "madring", "name": "Madring", "location": "Madrid", "country": "Spain"},
    {
        "ref": "catalunya",
        "name": "Circuit de Barcelona-Catalunya",
        "location": "Montmeló",
        "country": "Spain",
    },
    {
        "ref": "suzuka",
        "name": "Suzuka Circuit",
        "location": "Suzuka",
        "country": "Japan",
    },
]


def _linker() -> EntityLinker:
    return EntityLinker.from_rows(KB, DRIVERS, TEAMS, CIRCUITS)


def _intent(
    metadata_filter: dict | None = None,
    drivers: list[str] | None = None,
    teams: list[str] | None = None,
) -> dict:
    return {
        "intent": "factual",
        "entities": {
            "drivers": drivers or [],
            "teams": teams or [],
            "circuits": [],
            "seasons": [],
        },
        "metadata_filter": metadata_filter or {},
    }


def test_full_name_refs_become_knowledge_base_refs() -> None:
    out = _linker().link(
        _intent({"driver_ref": "oliver_bearman"}, ["oliver_bearman"]),
        "Tell me about Oliver Bearman.",
    )
    assert out["metadata_filter"] == {"driver_ref": "bearman"}
    assert out["entities"]["drivers"] == ["bearman"]


def test_drivers_the_classifier_missed_are_found_by_name() -> None:
    # The classifier doesn't know the 2026 rookies; an unambiguous name is enough
    out = _linker().link(_intent(), "Who is Arvid Lindblad?")
    assert out["metadata_filter"] == {"driver_ref": "arvid_lindblad"}
    assert out["entities"]["drivers"] == ["arvid_lindblad"]


def test_teams_the_classifier_missed_are_found_by_name() -> None:
    out = _linker().link(_intent(), "How is Cadillac doing in its first F1 season?")
    assert out["metadata_filter"] == {"constructor_ref": "cadillac"}
    assert out["entities"]["teams"] == ["cadillac"]


def test_two_drivers_found_by_name_make_a_comparison() -> None:
    out = _linker().link(_intent(), "Who is faster, Norris or Piastri?")
    assert out["metadata_filter"] == {}
    assert set(out["entities"]["drivers"]) == {"norris", "piastri"}


def test_country_maps_to_its_only_circuit_and_keeps_the_season() -> None:
    out = _linker().link(
        _intent({"circuit_ref": "singapore", "season": 2026}),
        "Who retired from the 2026 Singapore Grand Prix?",
    )
    assert out["metadata_filter"] == {"circuit_ref": "marina_bay", "season": 2026}


def test_a_country_with_two_circuits_is_not_an_alias() -> None:
    out = _linker().link(_intent({"circuit_ref": "spain"}), "Racing in Spain")
    assert out["metadata_filter"] == {}


def test_city_names_resolve_to_circuits() -> None:
    intent = _intent()
    intent["entities"]["circuits"] = ["Madrid"]
    out = _linker().link(intent, "Who won the first Grand Prix in Madrid?")
    assert out["metadata_filter"] == {"circuit_ref": "madring"}


def test_circuits_the_classifier_missed_are_found_by_name_or_city() -> None:
    linker = _linker()
    for question in (
        "Who won the first Grand Prix at Madring in Madrid?",
        "Who won the first Grand Prix in Madrid?",
    ):
        out = linker.link(_intent(), question)
        assert out["metadata_filter"] == {"circuit_ref": "madring"}, question
        assert out["entities"]["circuits"] == ["madring"], question


def test_category_only_filters_are_dropped() -> None:
    out = _linker().link(
        _intent({"category": "explainers"}), "What are parc ferme rules?"
    )
    assert out["metadata_filter"] == {}


def test_season_is_dropped_from_profile_filters() -> None:
    out = _linker().link(
        _intent({"driver_ref": "norris", "season": 2026}, ["norris"]),
        "How many points has Norris scored in 2026?",
    )
    assert out["metadata_filter"] == {"driver_ref": "norris"}


def test_comparisons_use_entity_searches_instead_of_a_filter() -> None:
    out = _linker().link(
        _intent({}, ["lando_norris", "oscar_piastri"]),
        "Compare Lando Norris and Oscar Piastri in 2026.",
    )
    assert out["metadata_filter"] == {}
    assert out["entities"]["drivers"] == ["norris", "piastri"]


def test_race_questions_filter_on_the_circuit_and_keep_the_driver_as_entity() -> None:
    out = _linker().link(
        _intent(
            {"driver_ref": "max_verstappen", "circuit_ref": "suzuka", "season": 2026},
            ["max_verstappen"],
        ),
        "How did Verstappen do at Suzuka in 2026?",
    )
    assert out["metadata_filter"] == {"circuit_ref": "suzuka", "season": 2026}
    assert out["entities"]["drivers"] == ["max_verstappen"]


def test_refs_without_knowledge_docs_are_dropped() -> None:
    out = _linker().link(_intent({"driver_ref": "senna"}), "How good was Senna?")
    assert out["metadata_filter"] == {}


def test_surnames_point_at_the_driver_with_a_knowledge_doc() -> None:
    out = _linker().link(
        _intent({"driver_ref": "Verstappen"}), "What were Verstappen's recent results?"
    )
    assert out["metadata_filter"] == {"driver_ref": "max_verstappen"}


def test_country_mentions_are_not_entities() -> None:
    # Countries only repair names the classifier gives; a scan ignores them
    linker = EntityLinker.from_rows(
        [*KB, {"circuit_ref": "shanghai"}],
        DRIVERS,
        TEAMS,
        [
            *CIRCUITS,
            {
                "ref": "shanghai",
                "name": "Shanghai International Circuit",
                "location": "Shanghai",
                "country": "China",
            },
        ],
    )
    for question in (
        "Is China a big market for F1?",
        "Is Singapore a big market for F1?",
    ):
        out = linker.link(_intent(), question)
        assert out["metadata_filter"] == {}, question
        assert out["entities"]["circuits"] == [], question


def _circuit_linker() -> EntityLinker:
    extra = [
        {
            "ref": "monaco",
            "name": "Circuit de Monaco",
            "location": "Monte-Carlo",
            "country": "Monaco",
        },
        {
            "ref": "bahrain",
            "name": "Bahrain International Circuit",
            "location": "Sakhir",
            "country": "Bahrain",
        },
        {
            "ref": "villeneuve",
            "name": "Circuit Gilles Villeneuve",
            "location": "Montreal",
            "country": "Canada",
        },
        {
            "ref": "americas",
            "name": "Circuit of the Americas",
            "location": "Austin",
            "country": "USA",
        },
    ]
    return EntityLinker.from_rows(
        [*KB, *({"circuit_ref": c["ref"]} for c in extra), {"driver_ref": "leclerc"}],
        [*DRIVERS, {"ref": "leclerc", "forename": "Charles", "surname": "Leclerc"}],
        TEAMS,
        [*CIRCUITS, *extra],
    )


def test_places_that_are_also_countries_or_people_need_a_race_name() -> None:
    linker = _circuit_linker()
    for question in (
        "Is Monaco expensive to visit?",
        "Is Bahrain a big market for F1?",
        "What did Jacques Villeneuve win?",
        "How popular is F1 across the Americas?",
    ):
        out = linker.link(_intent(), question)
        assert out["metadata_filter"] == {}, question
        assert out["entities"]["circuits"] == [], question


def test_a_race_name_or_circuit_name_is_enough() -> None:
    linker = _circuit_linker()
    cases = {
        # A year in the question becomes the season (#42)
        "Who won the 2025 Monaco Grand Prix?": {
            "circuit_ref": "monaco",
            "season": 2025,
        },
        "Who won the Bahrain Grand Prix that was held in Malaysia in 2026?": {
            "circuit_ref": "bahrain",
            "season": 2026,
        },
        "Is the Singapore GP hard on brakes?": {"circuit_ref": "marina_bay"},
        "Who won in Monte Carlo?": {"circuit_ref": "monaco"},
        "What makes Circuit Gilles Villeneuve tricky?": {"circuit_ref": "villeneuve"},
    }
    for question, expected in cases.items():
        out = linker.link(_intent(), question)
        assert out["metadata_filter"] == expected, question


def test_a_country_in_passing_leaves_the_classifier_filter_alone() -> None:
    out = _circuit_linker().link(
        _intent({"driver_ref": "leclerc"}, ["leclerc"]), "Is Leclerc from Monaco?"
    )
    assert out["metadata_filter"] == {"driver_ref": "leclerc"}


def test_aston_alone_is_not_aston_martin() -> None:
    linker = EntityLinker.from_rows(
        [*KB, {"constructor_ref": "aston_martin"}],
        DRIVERS,
        [*TEAMS, {"ref": "aston_martin", "name": "Aston Martin"}],
        CIRCUITS,
    )
    assert linker.link(_intent(), "Did Aston Villa win?")["entities"]["teams"] == []
    for intent, question in (
        (_intent(), "How is Aston Martin doing?"),
        (_intent(teams=["Aston"]), "How is Aston doing?"),
    ):
        out = linker.link(intent, question)
        assert out["metadata_filter"] == {"constructor_ref": "aston_martin"}, question


def _stroll_linker() -> EntityLinker:
    return EntityLinker.from_rows(
        [*KB, {"driver_ref": "stroll"}, {"circuit_ref": "monza"}],
        [*DRIVERS, {"ref": "stroll", "forename": "Lance", "surname": "Stroll"}],
        TEAMS,
        [*CIRCUITS, {"ref": "monza", "name": "Monza", "location": "Monza"}],
    )


def test_surnames_that_are_everyday_words_are_not_scanned() -> None:
    out = _stroll_linker().link(_intent(), "Is a stroll around Monza worth it?")
    assert out["entities"]["drivers"] == []
    assert out["metadata_filter"] == {"circuit_ref": "monza"}


def test_drivers_with_everyday_surnames_are_still_found() -> None:
    linker = _stroll_linker()
    named = linker.link(_intent({}, ["Stroll"]), "How is Stroll doing this year?")
    assert named["metadata_filter"] == {"driver_ref": "stroll"}
    by_full_name = linker.link(_intent(), "Who is Lance Stroll?")
    assert by_full_name["metadata_filter"] == {"driver_ref": "stroll"}


def test_circuit_phrases_are_not_rescanned_as_teams() -> None:
    linker = EntityLinker.from_rows(
        [*KB, {"circuit_ref": "red_bull_ring"}],
        DRIVERS,
        TEAMS,
        [*CIRCUITS, {"ref": "red_bull_ring", "name": "Red Bull Ring"}],
    )
    out = linker.link(_intent(), "What is special about the Red Bull Ring?")
    assert out["entities"]["circuits"] == ["red_bull_ring"]
    assert out["entities"]["teams"] == []


def test_malformed_classifier_output_is_tolerated() -> None:
    bad = {"intent": "factual", "entities": "norris", "metadata_filter": ["x"]}
    out = _linker().link(bad, "How is Norris doing?")
    # The broken fields are ignored; the name in the question still links
    assert out["metadata_filter"] == {"driver_ref": "norris"}
    assert out["entities"]["drivers"] == ["norris"]


def test_shared_aliases_are_dropped_as_ambiguous() -> None:
    linker = EntityLinker.from_rows(
        [{"driver_ref": "a_smith"}, {"driver_ref": "b_smith"}],
        [
            {"ref": "a_smith", "forename": "Al", "surname": "Smith"},
            {"ref": "b_smith", "forename": "Bo", "surname": "Smith"},
        ],
        [],
        [],
    )
    out = linker.link(_intent(), "How fast is Smith?")
    assert out["metadata_filter"] == {}


def test_other_intent_fields_are_kept() -> None:
    out = _linker().link(_intent(), "Who is Arvid Lindblad?")
    assert out["intent"] == "factual"


def test_years_before_the_knowledge_base_skip_race_filters() -> None:
    linker = EntityLinker.from_rows(
        [*KB, {"season": 2018, "circuit_ref": "suzuka"}], DRIVERS, TEAMS, CIRCUITS
    )
    out = linker.link(
        _intent({"category": "history"}),
        "What happened between Senna and Prost at Suzuka in 1989?",
    )
    assert out["metadata_filter"] == {}
    assert out["entities"]["circuits"] == ["suzuka"]


def test_first_season_comes_from_the_knowledge_base() -> None:
    linker = EntityLinker.from_rows(
        [{"season": 1950, "circuit_ref": "monza"}], [], [], []
    )
    assert linker.first_season == 1950


# Season fallback (#42): the intent model sometimes leaves the season out
# (r26-07 on 2026-11-25), but the year is written in the question.


def test_a_year_in_the_question_fills_a_missing_season() -> None:
    out = _circuit_linker().link(
        _intent(),
        "Who won the Bahrain Grand Prix that was held in Malaysia in 2026?",
    )
    assert out["metadata_filter"] == {"circuit_ref": "bahrain", "season": 2026}


def test_the_same_year_twice_still_fills_the_season() -> None:
    out = _linker().link(
        _intent({"circuit_ref": "suzuka"}),
        "Who won at Suzuka in 2026, and was 2026 his first win there?",
    )
    assert out["metadata_filter"] == {"circuit_ref": "suzuka", "season": 2026}


def test_two_different_years_leave_the_season_out() -> None:
    out = _linker().link(_intent(), "Who won at Suzuka in 2025 and in 2026?")
    assert out["metadata_filter"] == {"circuit_ref": "suzuka"}


def test_a_year_before_the_knowledge_base_still_skips_the_filter() -> None:
    linker = EntityLinker.from_rows(
        [*KB, {"season": 2018, "circuit_ref": "suzuka"}], DRIVERS, TEAMS, CIRCUITS
    )
    out = linker.link(_intent(), "Who won at Suzuka in 1989?")
    assert out["metadata_filter"] == {}


def test_a_classifier_season_beats_the_year_in_the_question() -> None:
    out = _linker().link(
        _intent({"circuit_ref": "suzuka", "season": 2025}),
        "Who won at Suzuka in 2026?",
    )
    assert out["metadata_filter"] == {"circuit_ref": "suzuka", "season": 2025}


def test_a_year_in_the_question_is_not_added_to_profile_filters() -> None:
    out = _linker().link(_intent(), "How many wins has Lando Norris taken in 2026?")
    assert out["metadata_filter"] == {"driver_ref": "norris"}


# The circuit's profile (#44): a season read from the question narrows the
# filter to that year's race, so the profile is named for a slot of its own


def test_a_season_read_from_the_question_names_the_circuit_profile() -> None:
    out = _linker().link(
        _intent({"circuit_ref": "suzuka"}),
        "Why is Suzuka hard on tyres for the 2026 cars?",
    )
    assert out["metadata_filter"] == {"circuit_ref": "suzuka", "season": 2026}
    assert out["circuit_profile"] == "suzuka"


def test_a_classifier_season_names_no_circuit_profile() -> None:
    out = _linker().link(
        _intent({"circuit_ref": "suzuka", "season": 2026}),
        "Who won at Suzuka in 2026?",
    )
    assert out["circuit_profile"] is None


def test_no_season_or_no_circuit_names_no_circuit_profile() -> None:
    linker = _linker()
    two_years = linker.link(_intent(), "Who won at Suzuka in 2025 and in 2026?")
    no_circuit = linker.link(_intent(), "How many wins has Lando Norris taken in 2026?")
    assert two_years["circuit_profile"] is None
    assert no_circuit["circuit_profile"] is None


def _corner_linker(kb_circuits: tuple[str, ...] = ("monza", "spa", "monaco")):
    extra = [
        {
            "ref": "monza",
            "name": "Autodromo Nazionale di Monza",
            "location": "Monza",
            "country": "Italy",
        },
        {
            "ref": "spa",
            "name": "Circuit de Spa-Francorchamps",
            "location": "Spa",
            "country": "Belgium",
        },
        {
            "ref": "monaco",
            "name": "Circuit de Monaco",
            "location": "Monte-Carlo",
            "country": "Monaco",
        },
        {
            "ref": "silverstone",
            "name": "Silverstone Circuit",
            "location": "Silverstone",
            "country": "UK",
        },
    ]
    return EntityLinker.from_rows(
        [*KB, *({"circuit_ref": ref} for ref in kb_circuits)],
        DRIVERS,
        TEAMS,
        [*CIRCUITS, *extra],
    )


def test_a_famous_corner_names_its_circuit() -> None:
    # Before the corner names, a question naming only a corner got no circuit
    # filter, and vector search returned glossary chunks instead of the track
    linker = _corner_linker()
    cases = {
        "How fast is the Parabolica?": "monza",
        "Why is Eau Rouge so hard to take flat out?": "spa",
        "How slow is the Sainte Dévote corner?": "monaco",
        "Is 130R still flat out?": "suzuka",
    }
    for question, ref in cases.items():
        out = linker.link(_intent(), question)
        assert out["metadata_filter"] == {"circuit_ref": ref}, question
        assert out["entities"]["circuits"] == [ref], question


def test_a_corner_the_classifier_names_is_repaired_to_its_circuit() -> None:
    out = _corner_linker().link(
        _intent({"circuit_ref": "parabolica"}), "Tell me about the Parabolica."
    )
    assert out["metadata_filter"] == {"circuit_ref": "monza"}


def test_corner_names_that_are_everyday_words_are_not_aliases() -> None:
    linker = _corner_linker(("monza", "spa", "monaco", "silverstone"))
    for question in (
        "Is Copse a fast corner?",
        "What happened at the Casino?",
        "Who was Alberto Ascari?",
        "Where is the Swimming Pool section?",
    ):
        out = linker.link(_intent(), question)
        assert out["metadata_filter"] == {}, question


def test_a_corner_needs_its_circuit_in_the_knowledge_base() -> None:
    # No Spa doc: the corner must not invent a filter that matches nothing
    out = _corner_linker(("monza",)).link(_intent(), "What is Eau Rouge?")
    assert out["metadata_filter"] == {}


def test_a_corner_the_question_names_beats_the_classifiers_other_circuit() -> None:
    # Gold circ-09: the classifier filed the question under Monaco, so Spa's
    # page reached the top 5 only through its own slot
    intent = _intent({"circuit_ref": "monaco", "season": 2024})
    intent["entities"]["circuits"] = ["monaco"]
    out = _corner_linker().link(intent, "Was Blanchimont taken flat out in 2024?")
    assert out["metadata_filter"] == {"circuit_ref": "spa", "season": 2024}
    # Both circuits keep their searches and slots
    assert set(out["entities"]["circuits"]) == {"monaco", "spa"}


def test_the_classifiers_circuit_stays_when_the_question_names_it_too() -> None:
    linker = _corner_linker()
    # A weak alias (the country) still counts as naming it here
    out = linker.link(
        _intent({"circuit_ref": "monaco"}), "Is Monaco slower than Eau Rouge?"
    )
    assert out["metadata_filter"] == {"circuit_ref": "monaco"}
    # Two circuits in the question: the classifier's choice stands
    out = linker.link(
        _intent({"circuit_ref": "monza"}), "Is Eau Rouge harder than the Rascasse?"
    )
    assert out["metadata_filter"] == {"circuit_ref": "monza"}


def test_the_classifiers_circuit_stays_when_the_question_names_none() -> None:
    out = _corner_linker().link(
        _intent({"circuit_ref": "monaco"}), "Who won the race in the principality?"
    )
    assert out["metadata_filter"] == {"circuit_ref": "monaco"}


def test_a_full_circuit_name_does_not_beat_the_classifiers_circuit() -> None:
    # "Japanese" names Suzuka, but no alias says so: only a corner, which the
    # classifier doesn't know, overrides its circuit
    out = _corner_linker().link(
        _intent({"circuit_ref": "suzuka"}), "Was the Japanese GP faster than Monza?"
    )
    assert out["metadata_filter"] == {"circuit_ref": "suzuka"}
