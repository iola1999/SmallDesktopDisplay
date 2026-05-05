import type {ConwayLifeViewModel, SnakeCellViewModel} from "../models/view-model.js";

const DEFAULT_COLUMNS = 32;
const DEFAULT_ROWS = 13;
const DEFAULT_CELL_SIZE = 6;
const CANDIDATE_COUNT = 160;
const CANDIDATE_EVALUATION_GENERATIONS = 160;
const SHORT_CYCLE_REFRESH_WINDOW = 8;
const MIN_ACTIVE_DENSITY = 0.04;
const STATIC_REFRESH_GENERATIONS = 4;

type LifePattern = SnakeCellViewModel[];

const GLIDER: LifePattern = [
  {x: 1, y: 0},
  {x: 2, y: 1},
  {x: 0, y: 2},
  {x: 1, y: 2},
  {x: 2, y: 2},
];

const LWSS: LifePattern = [
  {x: 1, y: 0},
  {x: 4, y: 0},
  {x: 0, y: 1},
  {x: 0, y: 2},
  {x: 4, y: 2},
  {x: 0, y: 3},
  {x: 1, y: 3},
  {x: 2, y: 3},
  {x: 3, y: 3},
];

const ACORN: LifePattern = [
  {x: 1, y: 0},
  {x: 3, y: 1},
  {x: 0, y: 2},
  {x: 1, y: 2},
  {x: 4, y: 2},
  {x: 5, y: 2},
  {x: 6, y: 2},
];

const R_PENTOMINO: LifePattern = [
  {x: 1, y: 0},
  {x: 2, y: 0},
  {x: 0, y: 1},
  {x: 1, y: 1},
  {x: 1, y: 2},
];

const TOAD: LifePattern = [
  {x: 1, y: 0},
  {x: 2, y: 0},
  {x: 3, y: 0},
  {x: 0, y: 1},
  {x: 1, y: 1},
  {x: 2, y: 1},
];

const BEACON: LifePattern = [
  {x: 0, y: 0},
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: 3, y: 2},
  {x: 2, y: 3},
  {x: 3, y: 3},
];

interface CandidateScore {
  cells: SnakeCellViewModel[];
  score: number;
  repeated: boolean;
  minAlive: number;
}

interface ConwayLifeInput {
  seed: string;
  generation: number;
  columns?: number;
  rows?: number;
  cellSize?: number;
}

export interface ConwayLifeRuntime {
  seed: string;
  columns: number;
  rows: number;
  cellSize: number;
  alive: SnakeCellViewModel[];
  seen: string[];
  stagnantGenerations: number;
  refreshIndex: number;
}

export function buildConwayLifeViewModel(input: ConwayLifeInput): ConwayLifeViewModel {
  const generation = Math.max(0, Math.floor(input.generation));
  let state = createConwayLifeRuntime(input);

  for (let index = 0; index < generation; index += 1) {
    state = advanceConwayLifeRuntime(state).runtime;
  }

  return conwayLifeRuntimeToViewModel(state);
}

export function createConwayLifeRuntime(input: {seed: string; columns?: number; rows?: number; cellSize?: number}): ConwayLifeRuntime {
  const columns = input.columns ?? DEFAULT_COLUMNS;
  const rows = input.rows ?? DEFAULT_ROWS;
  const cellSize = input.cellSize ?? DEFAULT_CELL_SIZE;
  const alive = seededCells(input.seed, columns, rows);
  return {seed: input.seed, columns, rows, cellSize, alive, seen: [cellSignature(alive)], stagnantGenerations: 0, refreshIndex: 0};
}

export function advanceConwayLifeRuntime(state: ConwayLifeRuntime): {runtime: ConwayLifeRuntime; status: "playing"} {
  const next = evolveConwayCells(state.alive, state.columns, state.rows);
  const signature = cellSignature(next);
  const stagnantGenerations = signature === state.seen[state.seen.length - 1] ? state.stagnantGenerations + 1 : 0;
  const previousIndex = state.seen.lastIndexOf(signature);
  const shortCycle = previousIndex >= 0 && state.seen.length - previousIndex <= SHORT_CYCLE_REFRESH_WINDOW;
  if (next.length < minimumActiveCells(state.columns, state.rows) || stagnantGenerations >= STATIC_REFRESH_GENERATIONS || shortCycle) {
    const refreshIndex = state.refreshIndex + 1;
    const alive = seededCells(`${state.seed}:refresh:${refreshIndex}`, state.columns, state.rows);
    return {
      runtime: {
        ...state,
        alive,
        seen: [cellSignature(alive)],
        stagnantGenerations: 0,
        refreshIndex,
      },
      status: "playing",
    };
  }
  return {
    runtime: {
      ...state,
      alive: next,
      seen: [...state.seen.slice(-180), signature],
      stagnantGenerations,
    },
    status: "playing",
  };
}

export function conwayLifeRuntimeToViewModel(state: ConwayLifeRuntime): ConwayLifeViewModel {
  return {columns: state.columns, rows: state.rows, cellSize: state.cellSize, alive: state.alive};
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
  let best: CandidateScore | null = null;
  for (let index = 0; index < CANDIDATE_COUNT; index += 1) {
    const cells = candidateCells(`${seed}:candidate:${index}`, columns, rows);
    const score = scoreCandidate(cells, columns, rows);
    if (!best || compareCandidate(score, best) > 0) {
      best = score;
      if (!score.repeated && score.minAlive >= minimumActiveCells(columns, rows) && score.score > CANDIDATE_EVALUATION_GENERATIONS * 2) {
        return score.cells;
      }
    }
  }
  return best?.cells ?? candidateCells(`${seed}:fallback`, columns, rows);
}

function candidateCells(seed: string, columns: number, rows: number): SnakeCellViewModel[] {
  const cells: SnakeCellViewModel[] = [];
  const used = new Set<string>();
  const random = mulberry32(hash(seed));
  const targetCount = Math.max(minimumActiveCells(columns, rows) + 12, Math.round(columns * rows * (0.16 + random() * 0.04)));
  const maxSeedCells = Math.round(columns * rows * 0.24);

  for (const pattern of shuffledPatterns(random)) {
    if (cells.length >= targetCount) break;
    if (cells.length + pattern.length > maxSeedCells) continue;
    placePattern(pattern, cells, used, columns, rows, random);
  }

  let attempts = 0;
  while (cells.length < targetCount && cells.length < maxSeedCells && attempts < columns * rows * 2) {
    attempts += 1;
    const cell = {x: Math.floor(random() * columns), y: Math.floor(random() * rows)};
    const key = cellKey(cell);
    if (used.has(key)) continue;
    used.add(key);
    cells.push(cell);
  }
  return cells
    .sort((left, right) => left.y - right.y || left.x - right.x);
}

function shuffledPatterns(random: () => number): LifePattern[] {
  const movablePatterns = [ACORN, LWSS, GLIDER, R_PENTOMINO, TOAD, BEACON];
  for (let index = movablePatterns.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [movablePatterns[index], movablePatterns[swapIndex]] = [movablePatterns[swapIndex], movablePatterns[index]];
  }
  return movablePatterns;
}

function placePattern(
  pattern: LifePattern,
  cells: SnakeCellViewModel[],
  used: Set<string>,
  columns: number,
  rows: number,
  random: () => number,
): boolean {
  const width = Math.max(...pattern.map((cell) => cell.x)) + 1;
  const height = Math.max(...pattern.map((cell) => cell.y)) + 1;
  if (width > columns || height > rows) return false;

  for (let attempt = 0; attempt < 36; attempt += 1) {
    const x = Math.floor(random() * (columns - width + 1));
    const y = Math.floor(random() * (rows - height + 1));
    const placed = pattern.map((cell) => ({x: x + cell.x, y: y + cell.y}));
    if (placed.some((cell) => used.has(cellKey(cell)))) continue;
    for (const cell of placed) {
      const key = cellKey(cell);
      used.add(key);
      cells.push(cell);
    }
    return true;
  }
  return false;
}

function scoreCandidate(cells: SnakeCellViewModel[], columns: number, rows: number): CandidateScore {
  let current = cells;
  let minAlive = current.length;
  let score = 0;
  const seen = new Map<string, number>();
  const minimum = minimumActiveCells(columns, rows);
  for (let generation = 0; generation < CANDIDATE_EVALUATION_GENERATIONS; generation += 1) {
    const signature = cellSignature(current);
    if (seen.has(signature)) {
      return {cells, score: score - (CANDIDATE_EVALUATION_GENERATIONS - generation) * 8, repeated: true, minAlive};
    }
    seen.set(signature, generation);
    const next = evolveConwayCells(current, columns, rows);
    minAlive = Math.min(minAlive, next.length);
    if (next.length < minimum) {
      return {cells, score: score - (CANDIDATE_EVALUATION_GENERATIONS - generation) * 6, repeated: false, minAlive};
    }
    score += changedCells(current, next) + Math.min(next.length, Math.round(columns * rows * 0.18));
    current = next;
  }
  return {cells, score, repeated: false, minAlive};
}

function compareCandidate(left: CandidateScore, right: CandidateScore): number {
  if (left.repeated !== right.repeated) return left.repeated ? -1 : 1;
  if (left.minAlive !== right.minAlive) return left.minAlive - right.minAlive;
  return left.score - right.score;
}

function changedCells(left: SnakeCellViewModel[], right: SnakeCellViewModel[]): number {
  const leftSet = new Set(left.map(cellKey));
  const rightSet = new Set(right.map(cellKey));
  let changed = 0;
  for (const key of leftSet) {
    if (!rightSet.has(key)) changed += 1;
  }
  for (const key of rightSet) {
    if (!leftSet.has(key)) changed += 1;
  }
  return changed;
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
