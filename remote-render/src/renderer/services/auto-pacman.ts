import type {SnakeCellViewModel} from "../models/view-model.js";

const DEFAULT_COLUMNS = 24;
const DEFAULT_ROWS = 10;
const DEFAULT_CELL_SIZE = 8;

export interface AutoPacmanRuntime {
  seed: string;
  columns: number;
  rows: number;
  cellSize: number;
  pacman: PacmanState;
  ghosts: GhostState[];
  walls: SnakeCellViewModel[];
  pellets: SnakeCellViewModel[];
  tick: number;
}

export interface PacmanState extends SnakeCellViewModel {
  direction: SnakeCellViewModel;
  mouthOpen: boolean;
}

export interface GhostState extends SnakeCellViewModel {
  color: string;
}

export function createAutoPacmanRuntime(input: {seed: string; columns?: number; rows?: number; cellSize?: number}): AutoPacmanRuntime {
  const columns = input.columns ?? DEFAULT_COLUMNS;
  const rows = input.rows ?? DEFAULT_ROWS;
  const cellSize = input.cellSize ?? DEFAULT_CELL_SIZE;
  const walls = createWalls(columns, rows);
  const pacman = {x: 1, y: 1, direction: {x: 1, y: 0}, mouthOpen: true};
  const ghosts = [
    {x: columns - 2, y: 1, color: "#ff7a9e"},
    {x: columns - 2, y: rows - 2, color: "#77e5ff"},
    {x: Math.floor(columns / 2), y: rows - 2, color: "#ffa45c"},
  ];
  return {
    seed: input.seed,
    columns,
    rows,
    cellSize,
    pacman,
    ghosts,
    walls,
    pellets: createPellets(seedOffset(input.seed), columns, rows, walls, pacman, ghosts),
    tick: 0,
  };
}

export function advanceAutoPacmanRuntime(state: AutoPacmanRuntime): {runtime: AutoPacmanRuntime; status: "playing" | "failed" | "won"} {
  const wallSet = new Set(state.walls.map(cellKey));
  const ghostDanger = new Set(state.ghosts.flatMap((ghost) => [ghost, ...neighbors(ghost, state.columns, state.rows)].map(cellKey)));
  const target = nearestReachablePellet(state.pacman, state.pellets, wallSet, ghostDanger, state.columns, state.rows);
  const nextPacmanCell = target ? nextStepToward(state.pacman, target, wallSet, ghostDanger, state.columns, state.rows) : state.pacman;
  const direction = {x: nextPacmanCell.x - state.pacman.x, y: nextPacmanCell.y - state.pacman.y};
  const pacman = {...nextPacmanCell, direction: direction.x === 0 && direction.y === 0 ? state.pacman.direction : direction, mouthOpen: !state.pacman.mouthOpen};
  const pellets = state.pellets.filter((pellet) => pellet.x !== pacman.x || pellet.y !== pacman.y);
  const ghosts =
    state.tick % 2 === 0
      ? state.ghosts.map((ghost, index) => moveGhost(ghost, pacman, wallSet, state.columns, state.rows, state.seed, state.tick, index))
      : state.ghosts;

  if (ghosts.some((ghost) => ghost.x === pacman.x && ghost.y === pacman.y)) {
    return {runtime: {...state, pacman, ghosts, pellets, tick: state.tick + 1}, status: "failed"};
  }
  if (pellets.length === 0) {
    return {runtime: {...state, pacman, ghosts, pellets, tick: state.tick + 1}, status: "won"};
  }
  return {runtime: {...state, pacman, ghosts, pellets, tick: state.tick + 1}, status: "playing"};
}

export function autoPacmanRuntimeToViewModel(state: AutoPacmanRuntime) {
  return {
    columns: state.columns,
    rows: state.rows,
    cellSize: state.cellSize,
    pacman: state.pacman,
    ghosts: state.ghosts,
    walls: state.walls,
    pellets: state.pellets,
  };
}

function createWalls(columns: number, rows: number): SnakeCellViewModel[] {
  const walls: SnakeCellViewModel[] = [];
  for (let x = 0; x < columns; x += 1) {
    walls.push({x, y: 0}, {x, y: rows - 1});
  }
  for (let y = 1; y < rows - 1; y += 1) {
    walls.push({x: 0, y}, {x: columns - 1, y});
  }
  for (let x = 4; x < columns - 4; x += 5) {
    for (let y = 2; y < rows - 2; y += 1) {
      if ((x + y) % 4 !== 0) walls.push({x, y});
    }
  }
  return dedupe(walls);
}

function createPellets(seed: number, columns: number, rows: number, walls: SnakeCellViewModel[], pacman: SnakeCellViewModel, ghosts: SnakeCellViewModel[]): SnakeCellViewModel[] {
  const blocked = new Set([...walls, pacman, ...ghosts].map(cellKey));
  const pellets: SnakeCellViewModel[] = [];
  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < columns - 1; x += 1) {
      const cell = {x, y};
      if (blocked.has(cellKey(cell))) continue;
      if ((hash(`${seed}:${x}:${y}`) % 100) < 72) pellets.push(cell);
    }
  }
  return pellets;
}

function nearestReachablePellet(
  start: SnakeCellViewModel,
  pellets: SnakeCellViewModel[],
  wallSet: Set<string>,
  dangerSet: Set<string>,
  columns: number,
  rows: number,
): SnakeCellViewModel | null {
  const pelletSet = new Set(pellets.map(cellKey));
  const queue: SnakeCellViewModel[] = [start];
  const seen = new Set<string>([cellKey(start)]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (pelletSet.has(cellKey(current))) return current;
    for (const next of neighbors(current, columns, rows)) {
      const key = cellKey(next);
      if (seen.has(key) || wallSet.has(key) || dangerSet.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return pellets.sort((left, right) => manhattan(start, left) - manhattan(start, right))[0] ?? null;
}

function nextStepToward(
  start: SnakeCellViewModel,
  target: SnakeCellViewModel,
  wallSet: Set<string>,
  dangerSet: Set<string>,
  columns: number,
  rows: number,
): SnakeCellViewModel {
  const queue: Array<{cell: SnakeCellViewModel; first: SnakeCellViewModel}> = neighbors(start, columns, rows)
    .filter((cell) => !wallSet.has(cellKey(cell)) && !dangerSet.has(cellKey(cell)))
    .map((cell) => ({cell, first: cell}));
  const seen = new Set<string>([cellKey(start), ...queue.map((entry) => cellKey(entry.cell))]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.cell.x === target.x && current.cell.y === target.y) return current.first;
    for (const next of neighbors(current.cell, columns, rows)) {
      const key = cellKey(next);
      if (seen.has(key) || wallSet.has(key)) continue;
      seen.add(key);
      queue.push({cell: next, first: current.first});
    }
  }
  return start;
}

function moveGhost(
  ghost: GhostState,
  pacman: SnakeCellViewModel,
  wallSet: Set<string>,
  columns: number,
  rows: number,
  seed: string,
  tick: number,
  index: number,
): GhostState {
  const options = neighbors(ghost, columns, rows).filter((cell) => !wallSet.has(cellKey(cell)));
  const best = options
    .map((cell) => ({cell, score: manhattan(cell, pacman) + (hash(`${seed}:${tick}:${index}:${cell.x}:${cell.y}`) % 3) * 0.35}))
    .sort((left, right) => left.score - right.score)[0]?.cell ?? ghost;
  return {...ghost, x: best.x, y: best.y};
}

function neighbors(cell: SnakeCellViewModel, columns: number, rows: number): SnakeCellViewModel[] {
  return [
    {x: cell.x + 1, y: cell.y},
    {x: cell.x, y: cell.y + 1},
    {x: cell.x - 1, y: cell.y},
    {x: cell.x, y: cell.y - 1},
  ].filter((next) => next.x >= 0 && next.x < columns && next.y >= 0 && next.y < rows);
}

function dedupe(cells: SnakeCellViewModel[]): SnakeCellViewModel[] {
  return Array.from(new Map(cells.map((cell) => [cellKey(cell), cell])).values());
}

function manhattan(left: SnakeCellViewModel, right: SnakeCellViewModel): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function cellKey(cell: SnakeCellViewModel): string {
  return `${cell.x},${cell.y}`;
}

function seedOffset(seed: string): number {
  return hash(seed) % 997;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
