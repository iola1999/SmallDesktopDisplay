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

  test("avoids a short food path that seals the snake away from its tail", () => {
    const runtime: AutoSnakeRuntime = {
      columns: 7,
      rows: 6,
      cellSize: 6,
      body: [
        {x: 2, y: 2},
        {x: 1, y: 2},
        {x: 1, y: 1},
        {x: 2, y: 1},
        {x: 3, y: 1},
        {x: 4, y: 1},
        {x: 5, y: 1},
        {x: 5, y: 2},
        {x: 5, y: 3},
        {x: 4, y: 3},
        {x: 3, y: 3},
        {x: 3, y: 4},
        {x: 2, y: 4},
        {x: 1, y: 4},
      ],
      food: {x: 4, y: 2},
      direction: {x: 1, y: 0},
      foodIndex: 0,
    };

    const advanced = advanceAutoSnakeRuntime(runtime, "sealed-food");

    expect(advanced.status).toBe("playing");
    expect(advanced.runtime.body[0]).toEqual({x: 2, y: 3});
  });

  test("eats adjacent food when the move remains safe", () => {
    const runtime: AutoSnakeRuntime = {
      columns: 24,
      rows: 10,
      cellSize: 8,
      body: [
        {x: 20, y: 3},
        {x: 21, y: 3},
        {x: 21, y: 4},
        {x: 21, y: 5},
        {x: 20, y: 5},
        {x: 19, y: 5},
      ],
      food: {x: 20, y: 4},
      direction: {x: -1, y: 0},
      foodIndex: 1,
    };

    const advanced = advanceAutoSnakeRuntime(runtime, "home-snake:0");

    expect(advanced.status).toBe("playing");
    expect(advanced.runtime.body[0]).toEqual(runtime.food);
    expect(advanced.runtime.body.length).toBe(runtime.body.length + 1);
  });

  test("turns toward reachable food instead of looping along the long corridor", () => {
    const runtime: AutoSnakeRuntime = {
      columns: 24,
      rows: 10,
      cellSize: 8,
      body: [
        {x: 5, y: 0},
        {x: 5, y: 1},
        {x: 5, y: 2},
        {x: 5, y: 3},
        {x: 5, y: 4},
        {x: 5, y: 5},
        ...range(6, 23).map((x) => ({x, y: 5})),
        {x: 23, y: 4},
        {x: 23, y: 3},
        {x: 23, y: 2},
        {x: 23, y: 1},
        ...range(22, 6).map((x) => ({x, y: 1})),
      ],
      food: {x: 0, y: 0},
      direction: {x: 0, y: -1},
      foodIndex: 10,
    };

    const advanced = advanceAutoSnakeRuntime(runtime, "corridor-loop");

    expect(advanced.status).toBe("playing");
    expect(advanced.runtime.body[0]).toEqual({x: 4, y: 0});
  });

  test("survives long autonomous runs while continuing to eat", () => {
    for (const seed of ["home-snake:0", "home-snake:1", "home-snake:2"]) {
      let runtime = createTestSnakeRuntime();
      for (let step = 0; step < 300; step += 1) {
        const advanced = advanceAutoSnakeRuntime(runtime, seed);
        expect(advanced.status).toBe("playing");
        runtime = advanced.runtime;
      }
      expect(runtime.body.length).toBeGreaterThan(10);
    }
  });
});

function manhattan(leftX: number, leftY: number, rightX: number, rightY: number): number {
  return Math.abs(leftX - rightX) + Math.abs(leftY - rightY);
}

function createTestSnakeRuntime(): AutoSnakeRuntime {
  return {
    columns: 24,
    rows: 10,
    cellSize: 8,
    body: [
      {x: 4, y: 5},
      {x: 3, y: 5},
      {x: 2, y: 5},
      {x: 1, y: 5},
      {x: 0, y: 5},
    ],
    food: {x: 20, y: 5},
    direction: {x: 1, y: 0},
    foodIndex: 0,
  };
}

function range(start: number, end: number): number[] {
  const step = start <= end ? 1 : -1;
  const result: number[] = [];
  for (let value = start; value !== end + step; value += step) {
    result.push(value);
  }
  return result;
}
