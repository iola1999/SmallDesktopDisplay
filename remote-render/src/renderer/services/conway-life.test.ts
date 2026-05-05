import {describe, expect, test} from "vitest";

import {advanceConwayLifeRuntime, buildConwayLifeViewModel, createConwayLifeRuntime, evolveConwayCells} from "./conway-life.js";

describe("Conway life view model", () => {
  test("generates deterministic bounded seeds", () => {
    const first = buildConwayLifeViewModel({seed: "slot-1", generation: 0, columns: 16, rows: 10, cellSize: 6});
    const again = buildConwayLifeViewModel({seed: "slot-1", generation: 0, columns: 16, rows: 10, cellSize: 6});
    const other = buildConwayLifeViewModel({seed: "slot-2", generation: 0, columns: 16, rows: 10, cellSize: 6});
    const density = first.alive.length / (first.columns * first.rows);

    expect(again).toEqual(first);
    expect(other.alive).not.toEqual(first.alive);
    expect(first.alive.length).toBeGreaterThan(0);
    expect(density).toBeGreaterThanOrEqual(0.08);
    expect(density).toBeLessThanOrEqual(0.28);
    expect(first.alive.every((cell) => cell.x >= 0 && cell.x < first.columns && cell.y >= 0 && cell.y < first.rows)).toBe(true);
  });

  test("keeps structured seeds animated without early refresh", () => {
    for (const seed of ["home-life:0", "home-life:1", "slot-1", "slot-2"]) {
      let runtime = createConwayLifeRuntime({seed});
      let previous = cellSignature(runtime.alive);
      let unchangedFrames = 0;
      for (let generation = 0; generation < 180; generation += 1) {
        runtime = advanceConwayLifeRuntime(runtime).runtime;
        const current = cellSignature(runtime.alive);
        if (current === previous) unchangedFrames += 1;
        previous = current;
      }

      expect(runtime.refreshIndex).toBe(0);
      expect(unchangedFrames).toBe(0);
      expect(runtime.alive.length).toBeGreaterThan(20);
    }
  });

  test("does not freeze to the initial seed during a five-minute life window", () => {
    const initial = buildConwayLifeViewModel({seed: "slot-1", generation: 0});
    const later = buildConwayLifeViewModel({seed: "slot-1", generation: 97});

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

function cellSignature(cells: Array<{x: number; y: number}>): string {
  return cells.map((cell) => `${cell.x},${cell.y}`).join(";");
}
