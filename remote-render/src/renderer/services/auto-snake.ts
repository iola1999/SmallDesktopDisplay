import type {AutoSnakeViewModel, SnakeCellViewModel} from "../models/view-model.js";

const DEFAULT_COLUMNS = 24;
const DEFAULT_ROWS = 10;
const DEFAULT_CELL_SIZE = 8;

interface AutoSnakeInput {
  seed: string;
  step: number;
  columns?: number;
  rows?: number;
  cellSize?: number;
}

export interface AutoSnakeRuntime {
  columns: number;
  rows: number;
  cellSize: number;
  body: SnakeCellViewModel[];
  food: SnakeCellViewModel;
  direction: SnakeCellViewModel;
  foodIndex: number;
}

const DIRECTIONS: SnakeCellViewModel[] = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];

export function buildAutoSnakeViewModel(input: AutoSnakeInput): AutoSnakeViewModel {
  const step = Math.max(0, Math.floor(input.step));
  let state = createAutoSnakeRuntime(input);

  for (let index = 0; index < step; index += 1) {
    state = advanceAutoSnakeRuntime(state, input.seed).runtime;
  }

  return autoSnakeRuntimeToViewModel(state);
}

export function createAutoSnakeRuntime(input: {columns?: number; rows?: number; cellSize?: number} = {}): AutoSnakeRuntime {
  const columns = input.columns ?? DEFAULT_COLUMNS;
  const rows = input.rows ?? DEFAULT_ROWS;
  const cellSize = input.cellSize ?? DEFAULT_CELL_SIZE;
  const y = Math.floor(rows / 2);
  return {
    columns,
    rows,
    cellSize,
    body: [
      {x: 4, y},
      {x: 3, y},
      {x: 2, y},
      {x: 1, y},
      {x: 0, y},
    ],
    food: {x: Math.max(6, columns - 4), y},
    direction: {x: 1, y: 0},
    foodIndex: 0,
  };
}

export function advanceAutoSnakeRuntime(state: AutoSnakeRuntime, seed: string): {runtime: AutoSnakeRuntime; status: "playing" | "failed" | "won"} {
  const direction = chooseDirection(state, seed);
  return advanceSnakeInDirection(state, direction, seed);
}

function advanceSnakeInDirection(state: AutoSnakeRuntime, direction: SnakeCellViewModel, seed: string): {runtime: AutoSnakeRuntime; status: "playing" | "failed" | "won"} {
  const head = state.body[0];
  const nextHead = {x: head.x + direction.x, y: head.y + direction.y};
  if (!inside(nextHead, state.columns, state.rows)) {
    return {runtime: state, status: "failed"};
  }

  const eats = sameCell(nextHead, state.food);
  const occupied = new Set(state.body.slice(0, eats ? state.body.length : -1).map(cellKey));
  if (occupied.has(cellKey(nextHead))) {
    return {runtime: state, status: "failed"};
  }
  const body = [nextHead, ...state.body];
  if (!eats) body.pop();
  const foodIndex = eats ? state.foodIndex + 1 : state.foodIndex;
  if (body.length >= state.columns * state.rows) {
    return {runtime: {...state, body, direction, foodIndex}, status: "won"};
  }
  const food = eats ? nextFood(seed, foodIndex, body, state.columns, state.rows) : state.food;
  return {runtime: {...state, body, food, direction, foodIndex}, status: "playing"};
}

export function autoSnakeRuntimeToViewModel(state: AutoSnakeRuntime): AutoSnakeViewModel {
  return {columns: state.columns, rows: state.rows, cellSize: state.cellSize, body: state.body, food: state.food};
}

function chooseDirection(state: AutoSnakeRuntime, seed: string): SnakeCellViewModel {
  const candidates = DIRECTIONS.filter((direction) => {
    if (direction.x === -state.direction.x && direction.y === -state.direction.y) return false;
    const head = state.body[0];
    const next = {x: head.x + direction.x, y: head.y + direction.y};
    return inside(next, state.columns, state.rows) && !collisionAfterStep(state, next);
  });
  if (candidates.length === 0) return state.direction;

  return candidates
    .map((direction) => ({
      direction,
      score: scoreDirection(state, direction, seed),
    }))
    .sort((left, right) => left.score - right.score)[0].direction;
}

function scoreDirection(state: AutoSnakeRuntime, direction: SnakeCellViewModel, seed: string): number {
  const advanced = advanceSnakeInDirection(state, direction, seed);
  if (advanced.status !== "playing") return 1_000_000;
  const next = advanced.runtime;
  const head = next.body[0];
  const eats = sameCell(head, state.food);
  const tail = next.body[next.body.length - 1];
  const occupiedWithoutTail = new Set(next.body.slice(0, -1).map(cellKey));
  const tailDistance = shortestPathDistance(head, tail, occupiedWithoutTail, next.columns, next.rows);
  const foodDistance = shortestPathDistance(head, next.food, occupiedWithoutTail, next.columns, next.rows);
  const area = reachableArea(head, occupiedWithoutTail, next.columns, next.rows);
  const targetArea = Math.min(next.columns * next.rows, next.body.length + 4);
  const tailRisk = tailDistance < 0 ? (area < targetArea ? 10_000 : 40) : tailDistance * 0.03;

  return (
    tailRisk +
    (foodDistance < 0 ? 2_000 + manhattan(head.x, head.y, next.food.x, next.food.y) : foodDistance) +
    Math.max(0, targetArea - area) * 80 +
    (eats && tailDistance >= 0 ? -120 : 0) +
    turnPenalty(direction, state.direction)
  );
}

function collisionAfterStep(state: AutoSnakeRuntime, nextHead: SnakeCellViewModel): boolean {
  const eats = sameCell(nextHead, state.food);
  return new Set(state.body.slice(0, eats ? state.body.length : -1).map(cellKey)).has(cellKey(nextHead));
}

function shortestPathDistance(start: SnakeCellViewModel, target: SnakeCellViewModel, occupied: Set<string>, columns: number, rows: number): number {
  const targetKey = cellKey(target);
  const queue: Array<{cell: SnakeCellViewModel; distance: number}> = [{cell: start, distance: 0}];
  const seen = new Set<string>([cellKey(start)]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (cellKey(current.cell) === targetKey) return current.distance;
    for (const direction of DIRECTIONS) {
      const next = {x: current.cell.x + direction.x, y: current.cell.y + direction.y};
      const key = cellKey(next);
      if (!inside(next, columns, rows) || seen.has(key) || (occupied.has(key) && key !== targetKey)) continue;
      seen.add(key);
      queue.push({cell: next, distance: current.distance + 1});
    }
  }
  return -1;
}

function reachableArea(start: SnakeCellViewModel, occupied: Set<string>, columns: number, rows: number): number {
  const queue: SnakeCellViewModel[] = [start];
  const seen = new Set<string>([cellKey(start)]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const direction of DIRECTIONS) {
      const next = {x: current.x + direction.x, y: current.y + direction.y};
      const key = cellKey(next);
      if (!inside(next, columns, rows) || seen.has(key) || occupied.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen.size;
}

function nextFood(seed: string, foodIndex: number, body: SnakeCellViewModel[], columns: number, rows: number): SnakeCellViewModel {
  const occupied = new Set(body.map(cellKey));
  const start = positiveModulo(hash(`${seed}:${foodIndex}`), columns * rows);
  for (let offset = 0; offset < columns * rows; offset += 1) {
    const index = (start + offset * 7) % (columns * rows);
    const cell = {x: index % columns, y: Math.floor(index / columns)};
    if (!occupied.has(cellKey(cell))) return cell;
  }
  return {x: 0, y: 0};
}

function turnPenalty(next: SnakeCellViewModel, current: SnakeCellViewModel): number {
  return next.x === current.x && next.y === current.y ? 0 : 0.15;
}

function inside(cell: SnakeCellViewModel, columns: number, rows: number): boolean {
  return cell.x >= 0 && cell.x < columns && cell.y >= 0 && cell.y < rows;
}

function sameCell(left: SnakeCellViewModel, right: SnakeCellViewModel): boolean {
  return left.x === right.x && left.y === right.y;
}

function manhattan(leftX: number, leftY: number, rightX: number, rightY: number): number {
  return Math.abs(leftX - rightX) + Math.abs(leftY - rightY);
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
