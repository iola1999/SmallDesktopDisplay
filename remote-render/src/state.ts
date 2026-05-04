import {encodeFrame} from "./protocol.js";
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  HOME_GAME_REGION,
  TIME_REGION,
  type CanvasImage,
  type RectTuple,
  type RenderedFrame,
  computeDirtyRects,
  renderCanvasFrame,
  renderDeviceCanvas,
} from "./renderer/index.js";
import {
  type InputEventName,
  DeviceCommand,
  DeviceUiState,
  applyInputEvent,
  currentAnimationProgress,
  isAnimationActive,
} from "./ui-state.js";

export class QueuedCommand {
  constructor(
    public id: number,
    public type: string,
    public value: number,
    public persist = true,
  ) {}
}

export interface FrameResult {
  frame: Buffer | null;
  waitMs: number;
  renderMs: number;
  totalMs: number;
}

export class DeviceState {
  frameId = 0;
  buttonCount = 0;
  lastInputSeq = 0;
  lastInputUptimeMs = -1;
  lastRenderSecond = -1;
  lastAnimationFrameAt = -1;
  lastClockAnimationSecond = -1;
  lastClockAnimationFrameAt = -1;
  lastClockAnimationCleanupSecond = -1;
  lastHomeGameStep = -1;
  lastHomeGameSlot = -1;
  frame: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  fullFrame: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  latestBaseFrameId = 0;
  latestFullFrame = true;
  canvas: CanvasImage | null = null;
  ui = new DeviceUiState();
  commandId = 0;
  latestCommand: QueuedCommand | null = null;

  constructor(public deviceId: string) {}
}

export interface RecordStatusInput {
  brightness: number;
  uptimeMs: number;
  heapFree?: number;
  heapMaxBlock?: number;
  heapFragmentation?: number;
  wifiRssi?: number;
}

interface DeviceRegistryOptions {
  monotonic?: () => number;
  frameIntervalSeconds?: number;
  animationFrameIntervalSeconds?: number;
  clockFlipAnimationSeconds?: number;
  homeGameFrameIntervalSeconds?: number;
  now?: () => Date;
}

export class DeviceRegistry {
  devices = new Map<string, DeviceState>();
  private monotonic: () => number;
  private frameIntervalSeconds: number;
  private animationFrameIntervalSeconds: number;
  private clockFlipAnimationSeconds: number;
  private homeGameFrameIntervalSeconds: number;
  private now: () => Date;

  constructor(options: DeviceRegistryOptions = {}) {
    this.monotonic = options.monotonic ?? (() => performance.now() / 1000);
    this.frameIntervalSeconds = options.frameIntervalSeconds ?? 1;
    this.animationFrameIntervalSeconds = options.animationFrameIntervalSeconds ?? 1 / 20;
    this.clockFlipAnimationSeconds = options.clockFlipAnimationSeconds ?? 0.3;
    this.homeGameFrameIntervalSeconds = options.homeGameFrameIntervalSeconds ?? 1;
    this.now = options.now ?? (() => new Date());
  }

  async getFrame(deviceId: string, have: number, waitMs: number): Promise<Buffer | null> {
    return (await this.getFrameWithStats(deviceId, have, waitMs)).frame;
  }

  async getFrameWithStats(deviceId: string, have: number, waitMs: number): Promise<FrameResult> {
    const started = this.monotonic();
    const deadline = this.monotonic() + Math.max(0, Math.min(waitMs, 5000)) / 1000;
    let waitSeconds = 0;
    let renderSeconds = 0;
    let state = this.ensureDevice(deviceId);
    renderSeconds += this.renderIfDue(state);
    let frame = this.selectFrameForClient(state, have);
    if (frame !== null) {
      return result(frame, waitSeconds, renderSeconds, this.monotonic() - started);
    }

    while (state.frameId <= have) {
      const remaining = deadline - this.monotonic();
      if (remaining <= 0) {
        return result(null, waitSeconds, renderSeconds, this.monotonic() - started);
      }
      const waitStarted = this.monotonic();
      await sleep(Math.min(remaining, 0.025));
      waitSeconds += Math.max(0, this.monotonic() - waitStarted);
      state = this.ensureDevice(deviceId);
      renderSeconds += this.renderIfDue(state);
      frame = this.selectFrameForClient(state, have);
      if (frame !== null) {
        return result(frame, waitSeconds, renderSeconds, this.monotonic() - started);
      }
    }
    return result(this.selectFrameForClient(state, have), waitSeconds, renderSeconds, this.monotonic() - started);
  }

  recordInput(deviceId: string, seq: number, event: InputEventName, uptimeMs = 0): boolean {
    const state = this.ensureDevice(deviceId);
    if (!this.shouldAcceptInput(state, seq, uptimeMs)) {
      return false;
    }
    const previousPage = state.ui.page;
    state.lastInputSeq = seq;
    state.lastInputUptimeMs = uptimeMs;
    state.buttonCount += 1;
    const commands = applyInputEvent(state.ui, event, this.monotonic());
    for (const command of commands) {
      this.queueCommand(state, command);
    }
    if (previousPage === "home" && state.ui.page === "home" && event === "double_press") {
      this.render(state, true);
      return true;
    }
    if (previousPage === "home" && state.ui.page === "home" && !state.ui.animation) {
      return true;
    }
    this.render(state, false);
    return true;
  }

  getCommand(deviceId: string, after: number): QueuedCommand | null {
    const state = this.ensureDevice(deviceId);
    if (state.latestCommand === null || state.latestCommand.id <= after) {
      return null;
    }
    return state.latestCommand;
  }

  recordStatus(deviceId: string, input: RecordStatusInput): void {
    const state = this.ensureDevice(deviceId);
    state.ui.brightness = input.brightness;
    state.ui.pendingBrightness = input.brightness;
    state.ui.diagnostics.heapFree = input.heapFree ?? 0;
    state.ui.diagnostics.heapMaxBlock = input.heapMaxBlock ?? 0;
    state.ui.diagnostics.heapFragmentation = input.heapFragmentation ?? 0;
    state.ui.diagnostics.wifiRssi = input.wifiRssi ?? 0;
    state.ui.diagnostics.uptimeMs = input.uptimeMs;
    state.lastInputUptimeMs = Math.max(state.lastInputUptimeMs, input.uptimeMs);
    this.render(state, false);
  }

  private ensureDevice(deviceId: string): DeviceState {
    let state = this.devices.get(deviceId);
    if (!state) {
      state = new DeviceState(deviceId);
      this.render(state, true);
      this.devices.set(deviceId, state);
    }
    return state;
  }

  private renderIfDue(state: DeviceState): number {
    const now = this.monotonic();
    if (isAnimationActive(state.ui, now)) {
      if (state.lastAnimationFrameAt < 0 || now - state.lastAnimationFrameAt >= this.animationFrameIntervalSeconds) {
        return this.render(state, false);
      }
      return 0;
    }
    if (state.ui.animation) {
      state.ui.animation = "";
      state.lastAnimationFrameAt = -1;
      return this.render(state, true);
    }
    const currentSecond = Math.floor(now / this.frameIntervalSeconds);
    if (state.ui.page === "home" && currentSecond === state.lastClockAnimationSecond) {
      const elapsed = now - currentSecond * this.frameIntervalSeconds;
      if (elapsed < this.clockFlipAnimationSeconds && now - state.lastClockAnimationFrameAt >= this.animationFrameIntervalSeconds) {
        state.lastClockAnimationFrameAt = now;
        return this.render(state, false, [TIME_REGION], elapsed / this.clockFlipAnimationSeconds, state.lastHomeGameStep);
      }
      if (elapsed >= this.clockFlipAnimationSeconds && state.lastClockAnimationCleanupSecond !== currentSecond) {
        state.lastClockAnimationCleanupSecond = currentSecond;
        return this.render(state, false, [TIME_REGION], 1, state.lastHomeGameStep);
      }
    }
    if (currentSecond <= state.lastRenderSecond) {
      if (state.ui.page === "home") {
        const gameStep = this.currentHomeGameStep(now);
        if (gameStep > state.lastHomeGameStep) {
          const gameSlotChanged = this.currentHomeGameSlot(this.now()) !== state.lastHomeGameSlot;
          state.lastHomeGameStep = gameStep;
          return this.render(
            state,
            false,
            gameSlotChanged ? [] : [HOME_GAME_REGION],
            1,
            gameStep,
            gameSlotChanged ? [HOME_GAME_REGION] : undefined,
          );
        }
      }
      return 0;
    }
    if (state.ui.page === "home") {
      const gameSlot = this.currentHomeGameSlot(this.now());
      state.lastClockAnimationSecond = currentSecond;
      state.lastClockAnimationFrameAt = now;
      const gameSlotChanged = gameSlot !== state.lastHomeGameSlot;
      return this.render(
        state,
        false,
        [TIME_REGION],
        0,
        state.lastHomeGameStep,
        gameSlotChanged ? [HOME_GAME_REGION] : undefined,
      );
    }
    return this.render(state, false, [TIME_REGION]);
  }

  private selectFrameForClient(state: DeviceState, have: number): Buffer | null {
    if (have === 0 || have > state.frameId) {
      return state.fullFrame;
    }
    if (state.frameId <= have) {
      return null;
    }
    if (state.latestFullFrame || state.latestBaseFrameId === have) {
      return state.frame;
    }
    return state.fullFrame;
  }

  private shouldAcceptInput(state: DeviceState, seq: number, uptimeMs: number): boolean {
    if (state.lastInputSeq === 0) return true;
    if (seq > state.lastInputSeq) return true;
    return uptimeMs < state.lastInputUptimeMs;
  }

  private render(
    state: DeviceState,
    fullFrame: boolean,
    regions?: RectTuple[],
    clockFlipProgress?: number,
    homeGameStep?: number,
    forcedRegions?: RectTuple[],
  ): number {
    const started = this.monotonic();
    const now = this.monotonic();
    const gameStep = state.ui.page === "home" ? (homeGameStep ?? this.resolveHomeGameStep(state, now, fullFrame)) : undefined;
    const baseFrameId = state.frameId;
    state.frameId += 1;
    state.lastRenderSecond = Math.floor(now / this.frameIntervalSeconds);
    if (isAnimationActive(state.ui, now)) {
      state.lastAnimationFrameAt = now;
    }
    const currentTime = this.now();
    const currentCanvas = renderDeviceCanvas({
      currentTime,
      deviceId: state.deviceId,
      buttonCount: state.buttonCount,
      uiState: state.ui,
      animationProgress: currentAnimationProgress(state.ui, now),
      clockFlipProgress,
      homeGameStep: gameStep,
    });
    if (state.ui.page === "home") {
      state.lastHomeGameSlot = this.currentHomeGameSlot(currentTime);
    }
    let rendered: RenderedFrame;
    if (fullFrame || state.canvas === null) {
      rendered = renderCanvasFrame(currentCanvas, {frameId: state.frameId, baseFrameId: 0, fullFrame: true});
    } else {
      const forcedRects = forcedRegions?.length
        ? renderCanvasFrame(currentCanvas, {
            frameId: state.frameId,
            baseFrameId,
            fullFrame: false,
            regions: forcedRegions,
          }).rects
        : [];
      rendered = {
        frameId: state.frameId,
        baseFrameId,
        fullFrame: false,
        rects: [...computeDirtyRects(state.canvas, currentCanvas, regions), ...forcedRects],
      };
    }
    state.frame = encodeRenderedFrame(rendered);
    state.latestBaseFrameId = rendered.baseFrameId;
    state.latestFullFrame = rendered.fullFrame;
    state.canvas = currentCanvas;
    state.fullFrame = fullFrame
      ? state.frame
      : encodeRenderedFrame(renderCanvasFrame(currentCanvas, {frameId: state.frameId, baseFrameId: 0, fullFrame: true}));
    return Math.max(0, this.monotonic() - started);
  }

  private resolveHomeGameStep(state: DeviceState, now: number, fullFrame: boolean): number {
    if (fullFrame || state.lastHomeGameStep < 0) {
      state.lastHomeGameStep = this.currentHomeGameStep(now);
    }
    return state.lastHomeGameStep;
  }

  private currentHomeGameStep(now: number): number {
    return Math.floor(now / this.homeGameFrameIntervalSeconds);
  }

  private currentHomeGameSlot(currentTime: Date): number {
    return Math.floor(currentTime.getTime() / (5 * 60 * 1000));
  }

  private queueCommand(state: DeviceState, command: DeviceCommand): void {
    state.commandId += 1;
    state.latestCommand = new QueuedCommand(state.commandId, command.type, command.value, command.persist);
  }
}

export function encodeRenderedFrame(frame: RenderedFrame): Buffer {
  return encodeFrame({
    frameId: frame.frameId,
    baseFrameId: frame.baseFrameId,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    rects: frame.rects,
    fullFrame: frame.fullFrame,
  });
}

function result(frame: Buffer | null, waitSeconds: number, renderSeconds: number, totalSeconds: number): FrameResult {
  return {
    frame,
    waitMs: elapsedMs(waitSeconds),
    renderMs: elapsedMs(renderSeconds),
    totalMs: elapsedMs(totalSeconds),
  };
}

function elapsedMs(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1000));
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, seconds * 1000)));
}
