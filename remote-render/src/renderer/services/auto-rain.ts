import type {AutoRainViewModel, RainCellViewModel} from "../models/view-model.js";

// 数字雨屏保：每列一条向下流动的光带，按 (seed, 列) 错峰，纯函数由 tick 推导，
// 完全确定、无随机状态，永不结束（status 恒为 playing）。

const DEFAULT_COLUMNS = 32;
const DEFAULT_ROWS = 13;
const DEFAULT_CELL_SIZE = 6;

export interface AutoRainRuntime {
  columns: number;
  rows: number;
  cellSize: number;
  seed: string;
  tick: number;
}

export function createAutoRainRuntime(input: {seed: string; columns?: number; rows?: number; cellSize?: number}): AutoRainRuntime {
  return {
    columns: input.columns ?? DEFAULT_COLUMNS,
    rows: input.rows ?? DEFAULT_ROWS,
    cellSize: input.cellSize ?? DEFAULT_CELL_SIZE,
    seed: input.seed,
    tick: 0,
  };
}

export function advanceAutoRainRuntime(state: AutoRainRuntime): {runtime: AutoRainRuntime; status: "playing"} {
  return {runtime: {...state, tick: state.tick + 1}, status: "playing"};
}

export function autoRainRuntimeToViewModel(state: AutoRainRuntime): AutoRainViewModel {
  const period = state.rows + 7; // 比行数多出空档，让光带之间有间隔
  const cells: RainCellViewModel[] = [];
  for (let column = 0; column < state.columns; column += 1) {
    const phase = hash(`${state.seed}:phase:${column}`) % period;
    const length = 3 + (hash(`${state.seed}:len:${column}`) % 4); // 3..6
    const head = (state.tick + phase) % period;
    for (let trail = 0; trail < length; trail += 1) {
      const y = head - trail;
      if (y < 0 || y >= state.rows) continue;
      const level = trail === 0 ? 1 : Math.max(0.18, 1 - trail / length);
      cells.push({x: column, y, level});
    }
  }
  return {columns: state.columns, rows: state.rows, cellSize: state.cellSize, cells};
}

export function buildAutoRainViewModel(input: {seed: string; step?: number; columns?: number; rows?: number; cellSize?: number}): AutoRainViewModel {
  let state = createAutoRainRuntime(input);
  const step = Math.max(0, Math.floor(input.step ?? 0));
  for (let index = 0; index < step; index += 1) {
    state = advanceAutoRainRuntime(state).runtime;
  }
  return autoRainRuntimeToViewModel(state);
}

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
