import type {DeviceUiState} from "../ui-state.js";
import type {RectTuple} from "./constants.js";
import type {HomeAmbientGameViewModel} from "./models/view-model.js";
import {renderCanvasFrame} from "./rendering/canvas-frame.js";
import {renderDeviceCanvas} from "./rendering/device-canvas.js";
import {registerFonts} from "./services/font-registry.js";
import type {RenderedFrame} from "./types.js";

export {
  FORECAST_REGION,
  GAME_AREA_REGION,
  GAME_TIME_REGION,
  HEADER_REGION,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  TIME_REGION,
} from "./constants.js";
export {renderCanvasFrame} from "./rendering/canvas-frame.js";
export {renderDeviceCanvas} from "./rendering/device-canvas.js";
export {computeDirtyRects} from "./rendering/dirty-rects.js";
export {buildClockFlipGlyphs} from "./services/clock-flip.js";
export {buildHomeCopy} from "./services/home-copy.js";
export type {RectTuple} from "./constants.js";
export type {CanvasImage, RenderedFrame} from "./types.js";

interface RenderDeviceViewOptions {
  deviceId: string;
  buttonCount: number;
  frameId?: number;
  baseFrameId?: number;
  fullFrame?: boolean;
  regions?: RectTuple[];
  now?: Date;
  uiState?: DeviceUiState;
  animationProgress?: number;
  homeGame?: HomeAmbientGameViewModel;
}

registerFonts();

export function renderDeviceView(options: RenderDeviceViewOptions): RenderedFrame {
  const image = renderDeviceCanvas({
    currentTime: options.now ?? new Date(),
    deviceId: options.deviceId,
    buttonCount: options.buttonCount,
    uiState: options.uiState,
    animationProgress: options.animationProgress,
    homeGame: options.homeGame,
  });
  return renderCanvasFrame(image, {
    frameId: options.frameId ?? 1,
    baseFrameId: options.baseFrameId ?? 0,
    fullFrame: options.fullFrame ?? true,
    regions: options.regions,
  });
}
