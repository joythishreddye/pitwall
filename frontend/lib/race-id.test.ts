import { describe, expect, it } from "vitest";
import { isRaceId } from "@/lib/race-id";

describe("isRaceId", () => {
  it("accepts a race's id", () => {
    expect(isRaceId(193)).toBe(true);
    expect(isRaceId(1)).toBe(true);
  });

  it("accepts the largest id the database can hold", () => {
    expect(isRaceId(2_147_483_647)).toBe(true);
  });

  it("rejects ids past the database's range, which the API answers with a 500", () => {
    expect(isRaceId(2_147_483_648)).toBe(false);
    expect(isRaceId(3_000_000_000)).toBe(false);
  });

  it("rejects what Number() makes of a URL segment that isn't a whole positive number", () => {
    for (const id of [0, -1, 193.5, Number.NaN, Number.POSITIVE_INFINITY, 1e30]) {
      expect(isRaceId(id), String(id)).toBe(false);
    }
  });
});
