import {describe, expect, test} from "vitest";

import {advanceAntColonyRuntime, antColonyRuntimeToViewModel, createAntColonyRuntime} from "./ant-colony.js";

describe("ant colony ambient game", () => {
  test("creates deterministic bounded colonies", () => {
    const first = createAntColonyRuntime({seed: "ants-1"});
    const again = createAntColonyRuntime({seed: "ants-1"});
    const other = createAntColonyRuntime({seed: "ants-2"});

    expect(again).toEqual(first);
    expect(other.food).not.toEqual(first.food);
    expect(first.ants.length).toBeGreaterThanOrEqual(10);
    expect(first.food.length).toBeGreaterThanOrEqual(4);
    expect(first.ants.every((ant) => ant.x >= 0 && ant.x < first.columns && ant.y >= 0 && ant.y < first.rows)).toBe(true);
  });

  test("keeps ants moving and collecting food over a long idle window", () => {
    let runtime = createAntColonyRuntime({seed: "ants-live"});
    const initialPositions = runtime.ants.map((ant) => `${ant.x},${ant.y}`).join(";");
    for (let tick = 0; tick < 240; tick += 1) {
      runtime = advanceAntColonyRuntime(runtime).runtime;
    }

    expect(runtime.ants.map((ant) => `${ant.x},${ant.y}`).join(";")).not.toEqual(initialPositions);
    expect(runtime.delivered).toBeGreaterThan(0);
    expect(runtime.food.length).toBeGreaterThanOrEqual(3);
    expect(antColonyRuntimeToViewModel(runtime).pheromones.length).toBeGreaterThan(0);
  });
});
