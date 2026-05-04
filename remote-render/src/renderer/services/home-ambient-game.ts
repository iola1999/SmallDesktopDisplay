import type {HomeAmbientGameViewModel} from "../models/view-model.js";
import {buildAutoSnakeViewModel} from "./auto-snake.js";
import {buildConwayLifeViewModel} from "./conway-life.js";

const SWITCH_INTERVAL_MS = 5 * 60 * 1000;

interface HomeAmbientGameInput {
  currentTime: Date;
  step: number;
}

export function buildHomeAmbientGameViewModel(input: HomeAmbientGameInput): HomeAmbientGameViewModel {
  const slot = Math.floor(input.currentTime.getTime() / SWITCH_INTERVAL_MS);
  const slotElapsedSeconds = Math.floor((input.currentTime.getTime() - slot * SWITCH_INTERVAL_MS) / 1000);
  if (slot % 2 === 0) {
    return {
      kind: "snake",
      snake: buildAutoSnakeViewModel({seed: "home", step: input.step}),
    };
  }
  return {
    kind: "life",
    life: buildConwayLifeViewModel({seed: `home-life:${slot}`, generation: slotElapsedSeconds}),
  };
}
