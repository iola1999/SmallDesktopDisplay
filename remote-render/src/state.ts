import {encodeFrame} from "./protocol.js";
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  FORECAST_REGION,
  HEADER_REGION,
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
  FONT_OPTIONS,
  THEME_OPTIONS,
  applyInputEvent,
  currentAnimationProgress,
  isAnimationActive,
} from "./ui-state.js";
import type {DevicePrefs, PrefsMap} from "./prefs-store.js";

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
  // 最近一次被访问的单调时刻（秒），用于淘汰长时间不活跃的设备条目。
  lastTouchedAt = 0;
  buttonCount = 0;
  lastInputSeq = 0;
  lastInputUptimeMs = -1;
  lastRenderSecond = -1;
  lastAnimationFrameAt = -1;
  lastClockAnimationSecond = -1;
  lastClockAnimationFrameAt = -1;
  lastClockAnimationCleanupSecond = -1;
  frame: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  // 全屏帧只有冷启动 / 重同步客户端才会用到。不再在每个 partial 帧里重新编码
  // 整屏，改为惰性计算：partial 渲染时把缓存置空，真正有客户端要全屏帧时再从
  // 当前 canvas 编码一次（同一 frameId 复用），其余帧省下整屏
  // RGBA->RGB565->RLE->CRC 的开销。
  fullFrameCache: Buffer<ArrayBufferLike> | null = null;
  latestBaseFrameId = 0;
  latestFullFrame = true;
  canvas: CanvasImage | null = null;
  ui = new DeviceUiState();
  commandId = 0;
  latestCommand: QueuedCommand | null = null;

  constructor(public deviceId: string) {}

  get fullFrame(): Buffer {
    if (this.fullFrameCache === null) {
      this.fullFrameCache =
        this.canvas === null
          ? Buffer.alloc(0)
          : encodeRenderedFrame(
              renderCanvasFrame(this.canvas, {frameId: this.frameId, baseFrameId: 0, fullFrame: true}),
            );
    }
    return this.fullFrameCache;
  }
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
  now?: () => Date;
  deviceIdleTtlSeconds?: number;
  evictionSweepIntervalSeconds?: number;
  // 落盘的设备偏好（主题/字体）：新设备条目创建时应用；变化时经回调持久化。
  initialPrefs?: PrefsMap;
  onPrefsChanged?: (deviceId: string, prefs: Required<DevicePrefs>) => void;
}

export class DeviceRegistry {
  devices = new Map<string, DeviceState>();
  private monotonic: () => number;
  private frameIntervalSeconds: number;
  private animationFrameIntervalSeconds: number;
  private clockFlipAnimationSeconds: number;
  private now: () => Date;
  private deviceIdleTtlSeconds: number;
  private evictionSweepIntervalSeconds: number;
  private lastEvictionSweepAt = -Infinity;
  private initialPrefs: PrefsMap;
  private onPrefsChanged?: (deviceId: string, prefs: Required<DevicePrefs>) => void;

  constructor(options: DeviceRegistryOptions = {}) {
    this.monotonic = options.monotonic ?? (() => performance.now() / 1000);
    this.frameIntervalSeconds = options.frameIntervalSeconds ?? 1;
    this.animationFrameIntervalSeconds = options.animationFrameIntervalSeconds ?? 1 / 20;
    this.clockFlipAnimationSeconds = options.clockFlipAnimationSeconds ?? 0.45;
    this.now = options.now ?? (() => new Date());
    // 默认 1 小时不活跃即淘汰，最多每 60s 扫描一次，避免任意 / 预览 device id
    // 让 devices Map 无限增长。回来的真实设备会因 have>frameId 自动收到全屏帧重同步。
    this.deviceIdleTtlSeconds = options.deviceIdleTtlSeconds ?? 3600;
    this.evictionSweepIntervalSeconds = options.evictionSweepIntervalSeconds ?? 60;
    this.initialPrefs = options.initialPrefs ?? {};
    this.onPrefsChanged = options.onPrefsChanged;
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
    const now = this.monotonic();
    state.lastInputSeq = seq;
    state.lastInputUptimeMs = uptimeMs;
    state.buttonCount += 1;
    this.applyGesture(state, event, now);
    return true;
  }

  // Web 控制台注入的手势：不参与设备的 seq/uptime 去重（否则控制台的大 seq
  // 会让设备后续的真实按键被误判为重放而丢弃）。
  applyConsoleGesture(deviceId: string, event: InputEventName): void {
    const state = this.ensureDevice(deviceId);
    this.applyGesture(state, event, this.monotonic());
  }

  // 控制台直接设定偏好：主题/字体立即生效并持久化；亮度走命令通道由设备落 EEPROM。
  applyPrefs(deviceId: string, prefs: {themeKey?: string; fontKey?: string; brightness?: number}): Required<DevicePrefs> & {brightness: number} {
    const state = this.ensureDevice(deviceId);
    const before = prefsSnapshot(state);
    if (prefs.themeKey !== undefined && (THEME_OPTIONS as readonly string[]).includes(prefs.themeKey)) {
      state.ui.themeKey = prefs.themeKey;
      state.ui.pendingThemeKey = prefs.themeKey;
    }
    if (prefs.fontKey !== undefined && (FONT_OPTIONS as readonly string[]).includes(prefs.fontKey)) {
      state.ui.fontKey = prefs.fontKey;
      state.ui.pendingFontKey = prefs.fontKey;
    }
    if (prefs.brightness !== undefined) {
      const value = Math.max(0, Math.min(100, Math.round(prefs.brightness)));
      state.ui.brightness = value;
      state.ui.pendingBrightness = value;
      this.queueCommand(state, new DeviceCommand("set_brightness", value, true));
    }
    this.emitPrefsIfChanged(state, before);
    this.render(state, true);
    return {themeKey: state.ui.themeKey, fontKey: state.ui.fontKey, brightness: state.ui.brightness};
  }

  // 控制台设备列表（只读，不创建条目）。
  listDevices(): Array<{deviceId: string; page: string; themeKey: string; fontKey: string; brightness: number; frameId: number; idleSeconds: number}> {
    const now = this.monotonic();
    return [...this.devices.values()].map((state) => ({
      deviceId: state.deviceId,
      page: state.ui.page,
      themeKey: state.ui.themeKey,
      fontKey: state.ui.fontKey,
      brightness: state.ui.brightness,
      frameId: state.frameId,
      idleSeconds: Math.max(0, Math.round(now - state.lastTouchedAt)),
    }));
  }

  // 控制台预览：确保画面新鲜后返回当前 canvas（ensureDevice 首渲染保证非空）。
  getPreviewImage(deviceId: string): CanvasImage {
    const state = this.ensureDevice(deviceId);
    this.renderIfDue(state);
    return state.canvas!;
  }

  private applyGesture(state: DeviceState, event: InputEventName, now: number): void {
    const previousPage = state.ui.page;
    const before = prefsSnapshot(state);
    const commands = applyInputEvent(state.ui, event, now);
    for (const command of commands) {
      this.queueCommand(state, command);
    }
    this.emitPrefsIfChanged(state, before);

    // 首页双击 = 强制整屏刷新
    if (previousPage === "home" && state.ui.page === "home" && event === "double_press") {
      this.render(state, true);
      return;
    }
    // 首页无可见变化（short_press 为无操作、long_press 已进设置页由动画分支处理）
    if (previousPage === "home" && state.ui.page === "home" && !state.ui.animation) {
      return;
    }
    this.render(state, false);
  }

  private emitPrefsIfChanged(state: DeviceState, before: Required<DevicePrefs>): void {
    if (!this.onPrefsChanged) return;
    if (before.themeKey === state.ui.themeKey && before.fontKey === state.ui.fontKey) return;
    this.onPrefsChanged(state.deviceId, {themeKey: state.ui.themeKey, fontKey: state.ui.fontKey});
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
    const now = this.monotonic();
    let state = this.devices.get(deviceId);
    if (!state) {
      state = new DeviceState(deviceId);
      const stored = this.initialPrefs[deviceId];
      if (stored?.themeKey && (THEME_OPTIONS as readonly string[]).includes(stored.themeKey)) {
        state.ui.themeKey = stored.themeKey;
        state.ui.pendingThemeKey = stored.themeKey;
      }
      if (stored?.fontKey && (FONT_OPTIONS as readonly string[]).includes(stored.fontKey)) {
        state.ui.fontKey = stored.fontKey;
        state.ui.pendingFontKey = stored.fontKey;
      }
      this.render(state, true);
      this.devices.set(deviceId, state);
    }
    state.lastTouchedAt = now;
    this.evictIdleDevices(now);
    return state;
  }

  // 节流扫描：每 evictionSweepIntervalSeconds 最多一次，删除超过 TTL 未访问的设备。
  // 当前正在访问的设备刚刷新过 lastTouchedAt，不会被误删。
  private evictIdleDevices(now: number): void {
    if (now - this.lastEvictionSweepAt < this.evictionSweepIntervalSeconds) {
      return;
    }
    this.lastEvictionSweepAt = now;
    for (const [deviceId, state] of this.devices) {
      if (now - state.lastTouchedAt > this.deviceIdleTtlSeconds) {
        this.devices.delete(deviceId);
      }
    }
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
        // diff 覆盖全部三个分区而不只是时钟带：暗背景雨滴跨区分布，跟着翻页帧整屏一致推进。
        return this.render(state, false, [HEADER_REGION, TIME_REGION, FORECAST_REGION], elapsed / this.clockFlipAnimationSeconds);
      }
      if (elapsed >= this.clockFlipAnimationSeconds && state.lastClockAnimationCleanupSecond !== currentSecond) {
        state.lastClockAnimationCleanupSecond = currentSecond;
        return this.render(state, false, [HEADER_REGION, TIME_REGION, FORECAST_REGION], 1);
      }
    }
    if (currentSecond <= state.lastRenderSecond) {
      return 0;
    }
    if (state.ui.page === "home") {
      state.lastClockAnimationSecond = currentSecond;
      state.lastClockAnimationFrameAt = now;
      // 安静首页每秒刷新：顶部（日期+农历）、时钟带、下方天气区（含暗背景雨滴）。
      return this.render(state, false, [HEADER_REGION, TIME_REGION, FORECAST_REGION]);
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
    forcedRegions?: RectTuple[],
  ): number {
    const now = this.monotonic();
    const started = now;
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
    });
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
    // 全屏渲染时 state.frame 本身就是整屏帧，直接缓存；partial 渲染则置空，
    // 等真正有冷启动 / 重同步客户端请求时再由 get fullFrame 惰性编码。
    state.fullFrameCache = fullFrame ? state.frame : null;
    return Math.max(0, this.monotonic() - started);
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

function prefsSnapshot(state: DeviceState): Required<import("./prefs-store.js").DevicePrefs> {
  return {themeKey: state.ui.themeKey, fontKey: state.ui.fontKey};
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, seconds * 1000)));
}
