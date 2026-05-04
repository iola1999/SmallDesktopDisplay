import type {ConwayLifeViewModel, SnakeCellViewModel} from "../models/view-model.js";

const DEFAULT_COLUMNS = 32;
const DEFAULT_ROWS = 13;
const DEFAULT_CELL_SIZE = 6;
const SEED_DENSITY = 0.22;
const MIN_ACTIVE_DENSITY = 0.06;

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
  const generation = Math.max(0, Math.floor(input.generation));
  const seen = new Set<string>([cellSignature(alive)]);

  for (let index = 0; index < generation; index += 1) {
    const next = evolveConwayCells(alive, columns, rows);
    const signature = cellSignature(next);
    if (next.length < minimumActiveCells(columns, rows) || seen.has(signature)) {
      alive = seededCells(`${input.seed}:refresh:${index}`, columns, rows);
      seen.clear();
      seen.add(cellSignature(alive));
      continue;
    }
    alive = next;
    seen.add(signature);
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
  const targetCount = Math.max(minimumActiveCells(columns, rows), Math.round(columns * rows * SEED_DENSITY));
  const cells: SnakeCellViewModel[] = [];
  const used = new Set<string>();
  const random = mulberry32(hash(seed));
  while (cells.length < targetCount) {
    const cell = {x: Math.floor(random() * columns), y: Math.floor(random() * rows)};
    const key = cellKey(cell);
    if (used.has(key)) continue;
    used.add(key);
    cells.push(cell);
  }
  return cells
    .sort((left, right) => left.y - right.y || left.x - right.x);
}

function minimumActiveCells(columns: number, rows: number): number {
  return Math.max(6, Math.round(columns * rows * MIN_ACTIVE_DENSITY));
}

function cellSignature(cells: SnakeCellViewModel[]): string {
  return cells.map(cellKey).join(";");
}

function parseCellKey(key: string): SnakeCellViewModel {
  const [x, y] = key.split(",").map(Number);
  return {x, y};
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

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
