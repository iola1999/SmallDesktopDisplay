import {describe, expect, test} from "vitest";

import {advanceAutoRainRuntime, autoRainRuntimeToViewModel, buildAutoRainViewModel, createAutoRainRuntime} from "./auto-rain.js";

describe("auto rain", () => {
  test("advances deterministically and never ends", () => {
    let runtime = createAutoRainRuntime({seed: "home-rain:0"});
    expect(runtime.tick).toBe(0);
    for (let index = 0; index < 50; index += 1) {
      const advanced = advanceAutoRainRuntime(runtime);
      expect(advanced.status).toBe("playing");
      runtime = advanced.runtime;
    }
    expect(runtime.tick).toBe(50);
  });

  test("keeps every cell inside the grid with a bright head", () => {
    const model = buildAutoRainViewModel({seed: "home-rain:0", step: 7});
    expect(model.cells.length).toBeGreaterThan(0);
    for (const cell of model.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(model.columns);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeLessThan(model.rows);
      expect(cell.level).toBeGreaterThan(0);
      expect(cell.level).toBeLessThanOrEqual(1);
    }
    // 每列至多一个 head（level === 1）
    const heads = model.cells.filter((cell) => cell.level >= 1);
    expect(new Set(heads.map((cell) => cell.x)).size).toBe(heads.length);
  });

  test("is a pure function of (seed, tick)", () => {
    const first = autoRainRuntimeToViewModel(advanceAutoRainRuntime(createAutoRainRuntime({seed: "s"})).runtime);
    const second = autoRainRuntimeToViewModel(advanceAutoRainRuntime(createAutoRainRuntime({seed: "s"})).runtime);
    expect(second).toEqual(first);
    const other = buildAutoRainViewModel({seed: "different", step: 1});
    expect(other.cells).not.toEqual(first.cells);
  });
});
