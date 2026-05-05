import {describe, expect, test} from "vitest";

import {buildHomeAmbientGameViewModel} from "./home-ambient-game.js";
import {advanceHomeGameRuntime, createHomeGameRuntime, switchHomeGameRuntime} from "./home-game-state.js";

describe("home ambient game view model", () => {
  test("builds a stable default game without wall-clock input", () => {
    const first = buildHomeAmbientGameViewModel({kind: "snake", round: 0});
    const again = buildHomeAmbientGameViewModel({kind: "snake", round: 0});

    expect(first.kind).toBe("snake");
    expect(again).toEqual(first);
  });

  test("manual switch cycles through all ambient games", () => {
    const snake = createHomeGameRuntime("snake", 0, 0);
    const life = switchHomeGameRuntime(snake, 3);
    const breakout = switchHomeGameRuntime(life, 6);
    const ants = switchHomeGameRuntime(breakout, 9);
    const pacman = switchHomeGameRuntime(ants, 12);
    const snakeAgain = switchHomeGameRuntime(pacman, 15);

    expect(life.kind).toBe("life");
    expect(breakout.kind).toBe("breakout");
    expect(ants.kind).toBe("ants");
    expect(pacman.kind).toBe("pacman");
    expect(snakeAgain.kind).toBe("snake");
  });

  test("twenty-minute timeout switches to the next game", () => {
    const runtime = createHomeGameRuntime("snake", 0, 0);
    const beforeTimeout = advanceHomeGameRuntime(runtime, 1199);
    const advanced = advanceHomeGameRuntime(runtime, 1200);

    expect(beforeTimeout.status).toBe("playing");
    expect(beforeTimeout.runtime.kind).toBe("snake");
    expect(advanced.status).toBe("timeout");
    expect(advanced.runtime.kind).toBe("life");
    expect(advanced.runtime.startedAt).toBe(1200);
  });

  test("normal ticks advance the current game without switching from wall-clock windows", () => {
    const runtime = createHomeGameRuntime("snake", 0, 0);
    const advanced = advanceHomeGameRuntime(runtime, 599);

    expect(advanced.status).toBe("playing");
    expect(advanced.runtime.kind).toBe("snake");
    expect(advanced.runtime.snake?.body).not.toEqual(runtime.snake?.body);
  });

  test("finished rounds restart the same game instead of jumping by time", () => {
    const runtime = createHomeGameRuntime("breakout", 4, 10);
    runtime.breakout!.bricks = [];
    const advanced = advanceHomeGameRuntime(runtime, 11);

    expect(advanced.status).toBe("won");
    expect(advanced.runtime.kind).toBe("breakout");
    expect(advanced.runtime.round).toBe(5);
  });
});
