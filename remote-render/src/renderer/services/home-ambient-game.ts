import type {HomeAmbientGameViewModel} from "../models/view-model.js";
import {createHomeGameRuntime, homeGameRuntimeToViewModel, type HomeGameKind} from "./home-game-state.js";

interface HomeAmbientGameInput {
  kind?: HomeGameKind;
  round?: number;
}

export function buildHomeAmbientGameViewModel(input: HomeAmbientGameInput): HomeAmbientGameViewModel {
  return homeGameRuntimeToViewModel(createHomeGameRuntime(input.kind ?? "snake", input.round ?? 0, 0));
}
