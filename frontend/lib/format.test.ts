import { describe, expect, it } from "vitest";
import { formatGap, formatLapTime, formatLapsDown, formatPitDuration, formatRaceTime, stripMarkdown } from "@/lib/format";

describe("formatLapTime", () => {
  it("shows minutes, seconds and thousandths", () => {
    expect(formatLapTime(83456)).toBe("1:23.456");
    expect(formatLapTime(5723504)).toBe("95:23.504"); // a race time: minutes past 60 stay minutes
  });

  it("pads seconds under ten", () => {
    expect(formatLapTime(65004)).toBe("1:05.004");
  });

  it("shows seconds alone under a minute", () => {
    expect(formatLapTime(59999)).toBe("59.999");
  });

  it("rounds to the thousandth before splitting minutes from seconds", () => {
    // OpenF1's lap durations carry more than three decimals: 59.9996 s is a minute, and 119.9997 s two
    expect(formatLapTime(59999.6)).toBe("1:00.000");
    expect(formatLapTime(119999.7)).toBe("2:00.000");
    expect(formatLapTime(83456.4)).toBe("1:23.456");
  });

  it("shows a dash for no time", () => {
    expect(formatLapTime(null)).toBe("—");
    expect(formatLapTime(undefined)).toBe("—");
    expect(formatLapTime(0)).toBe("—");
  });
});

describe("formatRaceTime", () => {
  it("shows hours, minutes, seconds and thousandths from an hour", () => {
    expect(formatRaceTime(5723504)).toBe("1:35:23.504");
    expect(formatRaceTime(3600000)).toBe("1:00:00.000");
    expect(formatRaceTime(7261123)).toBe("2:01:01.123");
    expect(formatRaceTime(3665004)).toBe("1:01:05.004");
  });

  it("shows a time under an hour as a lap time", () => {
    expect(formatRaceTime(3599999)).toBe("59:59.999");
    expect(formatRaceTime(83456)).toBe("1:23.456");
  });

  it("rounds to the thousandth before splitting off hours", () => {
    expect(formatRaceTime(3599999.6)).toBe("1:00:00.000");
    expect(formatRaceTime(5723504.4)).toBe("1:35:23.504");
  });

  it("shows a dash for no time", () => {
    expect(formatRaceTime(null)).toBe("—");
    expect(formatRaceTime(undefined)).toBe("—");
    expect(formatRaceTime(0)).toBe("—");
  });
});

describe("formatGap", () => {
  it("shows a finisher's gap to the winner", () => {
    expect(formatGap(5730000, 5723504, "Finished")).toBe("+6.496s");
  });

  it("shows the status for a car that didn't finish on the lead lap", () => {
    expect(formatGap(null, 5723504, "Retired")).toBe("Retired");
  });

  it("shows the winner's own time, with its hours", () => {
    expect(formatGap(5723504, 5723504, "Finished")).toBe("1:35:23.504");
  });
});

describe("formatLapsDown", () => {
  it("counts the laps behind the winner", () => {
    expect(formatLapsDown(70, 71)).toBe("+1 Lap");
    expect(formatLapsDown(68, 71)).toBe("+3 Laps");
  });

  it("shows a dash on the lead lap or with no data", () => {
    expect(formatLapsDown(71, 71)).toBe("—");
    expect(formatLapsDown(null, 71)).toBe("—");
  });
});

describe("formatPitDuration", () => {
  it("shows tenths of a second", () => {
    expect(formatPitDuration(22449)).toBe("22.4s");
    expect(formatPitDuration(null)).toBe("—");
  });
});

describe("stripMarkdown", () => {
  it("removes the decoration and keeps the words and numbered lists", () => {
    expect(stripMarkdown("## Pace\n**Norris** led *by far* today.\n1. `SOFT`\n- done")).toBe(
      "Pace\nNorris led by far today.\n1. SOFT\ndone",
    );
  });

  it("leaves a star inside a word alone", () => {
    expect(stripMarkdown("2*3*4 laps")).toBe("2*3*4 laps");
    expect(stripMarkdown("driver_ref_x and race_id")).toBe("driver_ref_x and race_id");
    // stars with spaces inside them aren't italics
    expect(stripMarkdown("2 * 3 * 4 = 24")).toBe("2 * 3 * 4 = 24");
  });

  it("removes italics that end before punctuation", () => {
    expect(stripMarkdown("It was *close*. Then *very* close, and _tense_!")).toBe(
      "It was close. Then very close, and tense!",
    );
    expect(stripMarkdown("Was it *fast*? (*Very*.)")).toBe("Was it fast? (Very.)");
  });

  it("removes italics that follow each other", () => {
    expect(stripMarkdown("*soft* *medium* *hard*")).toBe("soft medium hard");
  });
});
