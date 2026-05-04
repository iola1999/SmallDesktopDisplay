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

interface SnakeState {
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
  const columns = input.columns ?? DEFAULT_COLUMNS;
  const rows = input.rows ?? DEFAULT_ROWS;
  const cellSize = input.cellSize ?? DEFAULT_CELL_SIZE;
  const step = Math.max(0, Math.floor(input.step));
  let state = initialState(columns, rows);

  for (let index = 0; index < step; index += 1) {
    state = advanceSnake(state, columns, rows, input.seed);
  }

  return {columns, rows, cellSize, body: state.body, food: state.food};
}

function initialState(columns: number, rows: number): SnakeState {
  const y = Math.floor(rows / 2);
  return {
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

function advanceSnake(state: SnakeState, columns: number, rows: number, seed: string): SnakeState {
  const direction = chooseDirection(state, columns, rows);
  const head = state.body[0];
  const nextHead = {x: head.x + direction.x, y: head.y + direction.y};
  if (!inside(nextHead, columns, rows)) return initialState(columns, rows);

  const eats = sameCell(nextHead, state.food);
  const body = [nextHead, ...state.body];
  if (!eats) body.pop();
  const foodIndex = eats ? state.foodIndex + 1 : state.foodIndex;
  const food = eats ? nextFood(seed, foodIndex, body, columns, rows) : state.food;
  return {body, food, direction, foodIndex};
}

function chooseDirection(state: SnakeState, columns: number, rows: number): SnakeCellViewModel {
  const occupied = new Set(state.body.slice(0, -1).map(cellKey));
  const candidates = DIRECTIONS.filter((direction) => {
    if (direction.x === -state.direction.x && direction.y === -state.direction.y) return false;
    const head = state.body[0];
    const next = {x: head.x + direction.x, y: head.y + direction.y};
    return inside(next, columns, rows) && !occupied.has(cellKey(next));
  });
  if (candidates.length === 0) return state.direction;

  return candidates
    .map((direction) => ({
      direction,
      score: manhattan(state.body[0].x + direction.x, state.body[0].y + direction.y, state.food.x, state.food.y) + turnPenalty(direction, state.direction),
    }))
    .sort((left, right) => left.score - right.score)[0].direction;
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
