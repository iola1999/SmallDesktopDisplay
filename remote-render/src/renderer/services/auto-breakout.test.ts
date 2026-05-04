import {describe, expect, test} from "vitest";

import {advanceAutoBreakoutRuntime, autoBreakoutRuntimeToViewModel, createAutoBreakoutRuntime} from "./auto-breakout.js";

describe("auto breakout runtime", () => {
  test("creates a bounded brick field and moving ball", () => {
    const runtime = createAutoBreakoutRuntime({seed: "desk"});
    const next = advanceAutoBreakoutRuntime(runtime).runtime;
    const model = autoBreakoutRuntimeToViewModel(next);

    expect(model.bricks.length).toBeGreaterThanOrEqual(80);
    expect(Math.max(...model.bricks.map((brick) => brick.width))).toBeLessThanOrEqual(10);
    expect(Math.max(...model.bricks.map((brick) => brick.height))).toBeLessThanOrEqual(5);
    expect(Math.max(...model.bricks.map((brick) => brick.x + brick.width))).toBeGreaterThanOrEqual(model.width - 3);
    expect(model.balls.length).toBe(1);
    expect(model.balls[0].x).toBeGreaterThanOrEqual(0);
    expect(model.balls[0].x).toBeLessThanOrEqual(model.width);
    expect(model.balls[0].y).toBeGreaterThanOrEqual(0);
    expect(model.balls[0].y).toBeLessThanOrEqual(model.height);
  });

  test("caught drops spawn an extra upward ball", () => {
    const runtime = createAutoBreakoutRuntime({seed: "desk"});
    runtime.drops = [{x: runtime.paddle.x + runtime.paddle.width / 2, y: runtime.paddle.y, size: 4}];

    const advanced = advanceAutoBreakoutRuntime(runtime);

    expect(advanced.status).toBe("playing");
    expect(advanced.runtime.balls.length).toBeGreaterThan(runtime.balls.length);
  });

  test("moves balls and falling drops at the faster play speed", () => {
    const runtime = createAutoBreakoutRuntime({seed: "desk"});
    runtime.drops = [{x: 20, y: 10, size: 4}];
    const ballY = runtime.balls[0].y;

    const advanced = advanceAutoBreakoutRuntime(runtime).runtime;

    expect(advanced.balls[0].y).toBeLessThanOrEqual(ballY - 5);
    expect(advanced.drops[0].y).toBeGreaterThanOrEqual(13);
  });

  test("empty bricks win and empty balls fail", () => {
    const wonRuntime = createAutoBreakoutRuntime({seed: "desk"});
    wonRuntime.bricks = [];
    expect(advanceAutoBreakoutRuntime(wonRuntime).status).toBe("won");

    const failedRuntime = createAutoBreakoutRuntime({seed: "desk"});
    failedRuntime.balls = [];
    expect(advanceAutoBreakoutRuntime(failedRuntime).status).toBe("failed");
  });
});
