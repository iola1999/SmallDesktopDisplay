import {describe, expect, test} from "vitest";

import {advanceAutoPacmanRuntime, autoPacmanRuntimeToViewModel, createAutoPacmanRuntime} from "./auto-pacman.js";

describe("auto pacman ambient game", () => {
  test("creates deterministic mazes with pellets and ghosts", () => {
    const first = createAutoPacmanRuntime({seed: "pac-1"});
    const again = createAutoPacmanRuntime({seed: "pac-1"});
    const other = createAutoPacmanRuntime({seed: "pac-2"});

    expect(again).toEqual(first);
    expect(other.pellets).not.toEqual(first.pellets);
    expect(first.pellets.length).toBeGreaterThan(30);
    expect(first.ghosts.length).toBe(3);
    expect(first.walls.some((cell) => cell.x === first.pacman.x && cell.y === first.pacman.y)).toBe(false);
  });

  test("autonomously eats pellets without immediately ending", () => {
    let runtime = createAutoPacmanRuntime({seed: "pac-live"});
    const initialPellets = runtime.pellets.length;
    for (let tick = 0; tick < 180; tick += 1) {
      const advanced = advanceAutoPacmanRuntime(runtime);
      expect(advanced.status).toBe("playing");
      runtime = advanced.runtime;
    }

    expect(runtime.pellets.length).toBeLessThan(initialPellets);
    expect(autoPacmanRuntimeToViewModel(runtime).pacman.mouthOpen).toBeTypeOf("boolean");
  });
});
