import {describe, expect, test} from "vitest";

import {advanceAutoSnakeRuntime, buildAutoSnakeViewModel, type AutoSnakeRuntime} from "./auto-snake.js";

describe("auto snake view model", () => {
  test("moves toward food while avoiding immediate collisions", () => {
    const current = buildAutoSnakeViewModel({
      seed: "desk-01",
      step: 0,
      columns: 12,
      rows: 7,
      cellSize: 6,
    });
    const next = buildAutoSnakeViewModel({
      seed: "desk-01",
      step: 1,
      columns: 12,
      rows: 7,
      cellSize: 6,
    });

    const oldHead = current.body[0];
    const newHead = next.body[0];
    const oldDistance = manhattan(oldHead.x, oldHead.y, current.food.x, current.food.y);
    const newDistance = manhattan(newHead.x, newHead.y, next.food.x, next.food.y);
    const oldBody = new Set(current.body.slice(0, -1).map((cell) => `${cell.x},${cell.y}`));

    expect(newHead.x).toBeGreaterThanOrEqual(0);
    expect(newHead.y).toBeGreaterThanOrEqual(0);
    expect(newHead.x).toBeLessThan(current.columns);
    expect(newHead.y).toBeLessThan(current.rows);
    expect(oldBody.has(`${newHead.x},${newHead.y}`)).toBe(false);
    expect(newDistance).toBeLessThan(oldDistance);
  });

  test("keeps the simulated snake bounded and deterministic", () => {
    const first = buildAutoSnakeViewModel({seed: "desk-01", step: 42});
    const again = buildAutoSnakeViewModel({seed: "desk-01", step: 42});

    expect(again).toEqual(first);
    expect(first.body.length).toBeGreaterThanOrEqual(5);
    expect(first.body.every((cell) => cell.x >= 0 && cell.x < first.columns && cell.y >= 0 && cell.y < first.rows)).toBe(true);
    expect(first.body.some((cell) => cell.x === first.food.x && cell.y === first.food.y)).toBe(false);
  });

  test("does not restart at the old 180-step cycle boundary", () => {
    const initial = buildAutoSnakeViewModel({seed: "home", step: 0});
    const beforeBoundary = buildAutoSnakeViewModel({seed: "home", step: 179});
    const atBoundary = buildAutoSnakeViewModel({seed: "home", step: 180});

    expect(atBoundary).not.toEqual(initial);
    expect(manhattan(beforeBoundary.body[0].x, beforeBoundary.body[0].y, atBoundary.body[0].x, atBoundary.body[0].y)).toBe(1);
  });

  test("fails instead of moving through its own body when trapped", () => {
    const runtime: AutoSnakeRuntime = {
      columns: 5,
      rows: 5,
      cellSize: 6,
      body: [
        {x: 1, y: 1},
        {x: 2, y: 1},
        {x: 1, y: 2},
        {x: 1, y: 0},
        {x: 0, y: 0},
      ],
      food: {x: 4, y: 4},
      direction: {x: 1, y: 0},
      foodIndex: 0,
    };

    const advanced = advanceAutoSnakeRuntime(runtime, "trapped");

    expect(advanced.status).toBe("failed");
    expect(advanced.runtime).toEqual(runtime);
  });
});

function manhattan(leftX: number, leftY: number, rightX: number, rightY: number): number {
  return Math.abs(leftX - rightX) + Math.abs(leftY - rightY);
}
