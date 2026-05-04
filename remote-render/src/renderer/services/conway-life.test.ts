import {describe, expect, test} from "vitest";

import {buildConwayLifeViewModel, evolveConwayCells} from "./conway-life.js";

describe("Conway life view model", () => {
  test("generates deterministic bounded seeds", () => {
    const first = buildConwayLifeViewModel({seed: "slot-1", generation: 0, columns: 16, rows: 10, cellSize: 6});
    const again = buildConwayLifeViewModel({seed: "slot-1", generation: 0, columns: 16, rows: 10, cellSize: 6});
    const other = buildConwayLifeViewModel({seed: "slot-2", generation: 0, columns: 16, rows: 10, cellSize: 6});
    const density = first.alive.length / (first.columns * first.rows);

    expect(again).toEqual(first);
    expect(other.alive).not.toEqual(first.alive);
    expect(first.alive.length).toBeGreaterThan(0);
    expect(density).toBeGreaterThanOrEqual(0.16);
    expect(density).toBeLessThanOrEqual(0.28);
    expect(first.alive.every((cell) => cell.x >= 0 && cell.x < first.columns && cell.y >= 0 && cell.y < first.rows)).toBe(true);
  });

  test("does not loop back to the initial seed during a five-minute life window", () => {
    const initial = buildConwayLifeViewModel({seed: "slot-1", generation: 0});
    const later = buildConwayLifeViewModel({seed: "slot-1", generation: 96});

    expect(later.alive).not.toEqual(initial.alive);
  });

  test("applies Conway survival and birth rules", () => {
    const next = evolveConwayCells(
      [
        {x: 2, y: 1},
        {x: 2, y: 2},
        {x: 2, y: 3},
      ],
      5,
      5,
    );

    expect(next).toEqual([
      {x: 1, y: 2},
      {x: 2, y: 2},
      {x: 3, y: 2},
    ]);
  });
});
