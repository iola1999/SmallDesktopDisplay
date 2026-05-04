import type {ConwayLifeViewModel, SnakeCellViewModel} from "../models/view-model.js";

const DEFAULT_COLUMNS = 32;
const DEFAULT_ROWS = 13;
const DEFAULT_CELL_SIZE = 6;
const MAX_GENERATIONS = 96;
const SEED_DENSITY = 0.34;

interface ConwayLifeInput {
  seed: string;
  generation: number;
  columns?: number;
  rows?: number;
  cellSize?: number;
}

export function buildConwayLifeViewModel(input: ConwayLifeInput): ConwayLifeViewModel {
  const columns = input.columns ?? DEFAULT_COLUMNS;
  const rows = input.rows ?? DEFAULT_ROWS;
  const cellSize = input.cellSize ?? DEFAULT_CELL_SIZE;
  let alive = seededCells(input.seed, columns, rows);
  const generation = positiveModulo(Math.floor(input.generation), MAX_GENERATIONS);

  for (let index = 0; index < generation; index += 1) {
    alive = evolveConwayCells(alive, columns, rows);
    if (alive.length === 0) {
      alive = seededCells(`${input.seed}:restart:${index}`, columns, rows);
    }
  }

  return {columns, rows, cellSize, alive};
}

export function evolveConwayCells(alive: SnakeCellViewModel[], columns: number, rows: number): SnakeCellViewModel[] {
  const aliveSet = new Set(alive.map(cellKey));
  const neighborCounts = new Map<string, number>();

  for (const cell of alive) {
    for (let y = cell.y - 1; y <= cell.y + 1; y += 1) {
      for (let x = cell.x - 1; x <= cell.x + 1; x += 1) {
        if (x === cell.x && y === cell.y) continue;
        if (x < 0 || x >= columns || y < 0 || y >= rows) continue;
        const key = `${x},${y}`;
        neighborCounts.set(key, (neighborCounts.get(key) ?? 0) + 1);
      }
    }
  }

  return Array.from(neighborCounts.entries())
    .filter(([key, count]) => count === 3 || (count === 2 && aliveSet.has(key)))
    .map(([key]) => parseCellKey(key))
    .sort((left, right) => left.y - right.y || left.x - right.x);
}

function seededCells(seed: string, columns: number, rows: number): SnakeCellViewModel[] {
  const cells: SnakeCellViewModel[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const value = (hash(`${seed}:${x}:${y}`) % 10_000) / 10_000;
      if (value < SEED_DENSITY) cells.push({x, y});
    }
  }
  return cells;
}

function parseCellKey(key: string): SnakeCellViewModel {
  const [x, y] = key.split(",").map(Number);
  return {x, y};
}

function cellKey(cell: SnakeCellViewModel): string {
  return `${cell.x},${cell.y}`;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
