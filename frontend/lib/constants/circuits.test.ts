import { describe, expect, it } from "vitest";
import { CIRCUIT_META, circuitPaths, getCircuitMeta } from "@/lib/constants/circuits";

describe("getCircuitMeta", () => {
  it("finds Sepang, round 16's circuit in 2026, by the API's name", () => {
    const meta = getCircuitMeta("Sepang International Circuit");
    expect(meta?.key).toBe("sepang");
    expect(meta?.lengthKm).toBe(5.543);
    expect(meta?.turns).toBe(15);
  });

  it("finds Qatar's circuit, which the API calls Lusail, under Jolpica's id", () => {
    expect(getCircuitMeta("Lusail International Circuit")?.key).toBe("losail");
  });

  it("finds nothing for a circuit it doesn't know", () => {
    expect(getCircuitMeta("Kyalami Grand Prix Circuit")).toBeUndefined();
  });
});

describe("circuitPaths", () => {
  it("draws every circuit that has facts, so no race card is left without its outline", () => {
    const missing = Object.keys(CIRCUIT_META).filter((key) => !circuitPaths[key]);
    expect(missing).toEqual([]);
  });

  it("starts each outline with a move and gives it the shared 500 by 500 viewBox", () => {
    for (const [key, { d, viewBox }] of Object.entries(circuitPaths)) {
      // A first move is absolute in either case (Red Bull Ring's starts with "m")
      expect(d, key).toMatch(/^[Mm]/);
      expect(viewBox, key).toBe("0 0 500 500");
    }
  });

  it("keeps every point of Sepang's outline inside the 500 by 500 box", () => {
    // Sepang's path is all absolute moves and lines, so each number is a coordinate
    const numbers = circuitPaths.sepang.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    expect(numbers.length).toBeGreaterThan(100);
    expect(numbers.every((n) => n >= 0 && n <= 500)).toBe(true);
  });
});
