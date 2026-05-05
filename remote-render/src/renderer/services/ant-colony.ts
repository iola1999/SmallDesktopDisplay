import type {SnakeCellViewModel} from "../models/view-model.js";

const DEFAULT_COLUMNS = 32;
const DEFAULT_ROWS = 14;
const DEFAULT_CELL_SIZE = 6;
const ANT_COUNT = 14;
const FOOD_COUNT = 5;

export interface AntColonyRuntime {
  seed: string;
  columns: number;
  rows: number;
  cellSize: number;
  nest: SnakeCellViewModel;
  ants: AntState[];
  food: SnakeCellViewModel[];
  pheromones: AntPheromoneState[];
  delivered: number;
  tick: number;
}

export interface AntState extends SnakeCellViewModel {
  carrying: boolean;
}

export interface AntPheromoneState extends SnakeCellViewModel {
  level: number;
}

export function createAntColonyRuntime(input: {seed: string; columns?: number; rows?: number; cellSize?: number}): AntColonyRuntime {
  const columns = input.columns ?? DEFAULT_COLUMNS;
  const rows = input.rows ?? DEFAULT_ROWS;
  const cellSize = input.cellSize ?? DEFAULT_CELL_SIZE;
  const nest = {x: 2, y: Math.floor(rows / 2)};
  return {
    seed: input.seed,
    columns,
    rows,
    cellSize,
    nest,
    ants: Array.from({length: ANT_COUNT}, (_, index) => ({...nest, carrying: index % 5 === 0})),
    food: createFood(input.seed, columns, rows, nest, 0),
    pheromones: [],
    delivered: 0,
    tick: 0,
  };
}

export function advanceAntColonyRuntime(state: AntColonyRuntime): {runtime: AntColonyRuntime; status: "playing"} {
  const food = state.food.map((cell) => ({...cell}));
  const pheromoneMap = new Map(state.pheromones.map((cell) => [cellKey(cell), {...cell, level: Math.max(0, cell.level - 0.08)}]));
  let delivered = state.delivered;
  const ants = state.ants.map((ant, index) => {
    const carrying = ant.carrying;
    const target = carrying ? state.nest : nearestFood(ant, food) ?? wanderTarget(state, index);
    const next = stepToward(ant, target, state, index);
    const atNest = next.x === state.nest.x && next.y === state.nest.y;
    const foodIndex = food.findIndex((cell) => cell.x === next.x && cell.y === next.y);
    if (carrying && atNest) {
      delivered += 1;
      return {...next, carrying: false};
    }
    if (!carrying && foodIndex >= 0) {
      food.splice(foodIndex, 1);
      if (food.length < FOOD_COUNT) food.push(...createFood(state.seed, state.columns, state.rows, state.nest, state.tick + delivered).slice(0, FOOD_COUNT - food.length));
      return {...next, carrying: true};
    }
    if (carrying || foodIndex >= 0) {
      const key = cellKey(next);
      const existing = pheromoneMap.get(key);
      pheromoneMap.set(key, {...next, level: Math.min(1, (existing?.level ?? 0) + 0.35)});
    }
    return {...next, carrying};
  });

  return {
    runtime: {
      ...state,
      ants,
      food,
      pheromones: Array.from(pheromoneMap.values()).filter((cell) => cell.level > 0.12).slice(-80),
      delivered,
      tick: state.tick + 1,
    },
    status: "playing",
  };
}

export function antColonyRuntimeToViewModel(state: AntColonyRuntime) {
  return {
    columns: state.columns,
    rows: state.rows,
    cellSize: state.cellSize,
    nest: state.nest,
    ants: state.ants,
    food: state.food,
    pheromones: state.pheromones,
    delivered: state.delivered,
  };
}

function nearestFood(ant: SnakeCellViewModel, food: SnakeCellViewModel[]): SnakeCellViewModel | null {
  return food
    .map((cell) => ({cell, distance: manhattan(ant, cell)}))
    .sort((left, right) => left.distance - right.distance)[0]?.cell ?? null;
}

function stepToward(from: SnakeCellViewModel, target: SnakeCellViewModel, state: AntColonyRuntime, index: number): SnakeCellViewModel {
  const directions = [
    {x: 1, y: 0},
    {x: 0, y: 1},
    {x: -1, y: 0},
    {x: 0, y: -1},
  ];
  return directions
    .map((direction) => ({x: clamp(from.x + direction.x, 0, state.columns - 1), y: clamp(from.y + direction.y, 0, state.rows - 1)}))
    .sort((left, right) => {
      const leftScore = manhattan(left, target) + jitter(state.seed, state.tick, index, left) * 0.45;
      const rightScore = manhattan(right, target) + jitter(state.seed, state.tick, index, right) * 0.45;
      return leftScore - rightScore;
    })[0];
}

function wanderTarget(state: AntColonyRuntime, index: number): SnakeCellViewModel {
  const value = hash(`${state.seed}:wander:${state.tick}:${index}`);
  return {x: 4 + (value % Math.max(1, state.columns - 6)), y: 1 + (Math.floor(value / state.columns) % Math.max(1, state.rows - 2))};
}

function createFood(seed: string, columns: number, rows: number, nest: SnakeCellViewModel, offset: number): SnakeCellViewModel[] {
  const food: SnakeCellViewModel[] = [];
  for (let index = 0; food.length < FOOD_COUNT && index < FOOD_COUNT * 8; index += 1) {
    const value = hash(`${seed}:food:${offset}:${index}`);
    const cell = {x: Math.max(6, value % columns), y: 1 + (Math.floor(value / columns) % Math.max(1, rows - 2))};
    if (manhattan(cell, nest) < 6 || food.some((item) => item.x === cell.x && item.y === cell.y)) continue;
    food.push(cell);
  }
  return food;
}

function jitter(seed: string, tick: number, index: number, cell: SnakeCellViewModel): number {
  return (hash(`${seed}:${tick}:${index}:${cell.x}:${cell.y}`) % 1000) / 1000;
}

function manhattan(left: SnakeCellViewModel, right: SnakeCellViewModel): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cellKey(cell: SnakeCellViewModel): string {
  return `${cell.x},${cell.y}`;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
