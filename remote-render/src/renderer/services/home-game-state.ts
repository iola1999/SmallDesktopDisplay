import type {HomeAmbientGameViewModel} from "../models/view-model.js";
import {
  type AutoBreakoutRuntime,
  advanceAutoBreakoutRuntime,
  autoBreakoutRuntimeToViewModel,
  createAutoBreakoutRuntime,
} from "./auto-breakout.js";
import {
  type AutoSnakeRuntime,
  advanceAutoSnakeRuntime,
  autoSnakeRuntimeToViewModel,
  createAutoSnakeRuntime,
} from "./auto-snake.js";
import {
  type ConwayLifeRuntime,
  advanceConwayLifeRuntime,
  conwayLifeRuntimeToViewModel,
  createConwayLifeRuntime,
} from "./conway-life.js";

export type HomeGameKind = "snake" | "life" | "breakout";
export type HomeGameAdvanceStatus = "playing" | "failed" | "won" | "timeout";

export const HOME_GAME_KINDS: HomeGameKind[] = ["snake", "life", "breakout"];
export const HOME_GAME_ROUND_SECONDS = 20 * 60;

export interface HomeGameRuntime {
  kind: HomeGameKind;
  round: number;
  startedAt: number;
  seed: string;
  snake?: AutoSnakeRuntime;
  life?: ConwayLifeRuntime;
  breakout?: AutoBreakoutRuntime;
}

export function createHomeGameRuntime(kind: HomeGameKind = "snake", round = 0, startedAt = 0): HomeGameRuntime {
  const seed = `home-${kind}:${round}`;
  if (kind === "snake") {
    return {kind, round, startedAt, seed, snake: createAutoSnakeRuntime()};
  }
  if (kind === "life") {
    return {kind, round, startedAt, seed, life: createConwayLifeRuntime({seed})};
  }
  return {kind, round, startedAt, seed, breakout: createAutoBreakoutRuntime({seed})};
}

export function advanceHomeGameRuntime(runtime: HomeGameRuntime, now: number): {runtime: HomeGameRuntime; status: HomeGameAdvanceStatus} {
  if (now - runtime.startedAt >= HOME_GAME_ROUND_SECONDS) {
    return {runtime: createHomeGameRuntime(nextHomeGameKind(runtime.kind), runtime.round + 1, now), status: "timeout"};
  }
  if (runtime.kind === "snake" && runtime.snake) {
    const advanced = advanceAutoSnakeRuntime(runtime.snake, runtime.seed);
    if (advanced.status !== "playing") {
      return {runtime: createHomeGameRuntime(runtime.kind, runtime.round + 1, now), status: advanced.status};
    }
    return {runtime: {...runtime, snake: advanced.runtime}, status: "playing"};
  }
  if (runtime.kind === "life" && runtime.life) {
    const advanced = advanceConwayLifeRuntime(runtime.life);
    return {runtime: {...runtime, life: advanced.runtime}, status: advanced.status};
  }
  if (runtime.kind === "breakout" && runtime.breakout) {
    const advanced = advanceAutoBreakoutRuntime(runtime.breakout);
    if (advanced.status !== "playing") {
      return {runtime: createHomeGameRuntime(runtime.kind, runtime.round + 1, now), status: advanced.status};
    }
    return {runtime: {...runtime, breakout: advanced.runtime}, status: "playing"};
  }
  return {runtime: createHomeGameRuntime(runtime.kind, runtime.round + 1, now), status: "failed"};
}

export function switchHomeGameRuntime(runtime: HomeGameRuntime, now: number): HomeGameRuntime {
  return createHomeGameRuntime(nextHomeGameKind(runtime.kind), runtime.round + 1, now);
}

export function homeGameRuntimeToViewModel(runtime: HomeGameRuntime): HomeAmbientGameViewModel {
  if (runtime.kind === "snake" && runtime.snake) {
    return {kind: "snake", snake: autoSnakeRuntimeToViewModel(runtime.snake)};
  }
  if (runtime.kind === "life" && runtime.life) {
    return {kind: "life", life: conwayLifeRuntimeToViewModel(runtime.life)};
  }
  if (runtime.kind === "breakout" && runtime.breakout) {
    return {kind: "breakout", breakout: autoBreakoutRuntimeToViewModel(runtime.breakout)};
  }
  return {kind: "snake", snake: autoSnakeRuntimeToViewModel(createAutoSnakeRuntime())};
}

function nextHomeGameKind(kind: HomeGameKind): HomeGameKind {
  return HOME_GAME_KINDS[(HOME_GAME_KINDS.indexOf(kind) + 1) % HOME_GAME_KINDS.length];
}
