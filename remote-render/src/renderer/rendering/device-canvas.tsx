import type {HomeConfig} from "../../config/schema.js";
import {DeviceUiState} from "../../ui-state.js";
import {DeviceView} from "../view.js";
import type {CanvasImage} from "../types.js";
import {pasteAnimatedPage, shouldPasteAnimatedPage} from "./animation.js";
import {rasterizeElement} from "./rasterizer.js";
import {resolveFontKeyForView} from "../services/view-model.js";

export interface RenderDeviceCanvasOptions {
  currentTime: Date;
  deviceId: string;
  buttonCount: number;
  uiState?: DeviceUiState;
  animationProgress?: number;
  clockFlipProgress?: number;
  homeConfig?: HomeConfig;
}

export function renderDeviceCanvas(options: RenderDeviceCanvasOptions): CanvasImage {
  const state = options.uiState ?? new DeviceUiState();
  const progress = options.animationProgress ?? 1;
  const fontKey = resolveFontKeyForView(state);
  const page = rasterizeElement(
    <DeviceView
      currentTime={options.currentTime}
      deviceId={options.deviceId}
      state={state}
      progress={progress}
      clockFlipProgress={options.clockFlipProgress}
      homeConfig={options.homeConfig}
    />,
    fontKey,
  );

  if (!shouldPasteAnimatedPage(state.animation, progress)) {
    return page;
  }
  return pasteAnimatedPage(page, state.animation, progress);
}
