import path from "node:path";
import React from "react";
import {createCanvas, GlobalFonts, type SKRSContext2D} from "@napi-rs/canvas";
import Yoga, {Align, Direction, FlexDirection, Justify, PositionType} from "yoga-layout";
import type {Node as YogaNode} from "yoga-layout";

import {FrameRect, compressRectIfSmaller, rgbaToRgb565} from "../protocol.js";
import {
  DeviceUiState,
  FONT_LABELS,
  FONT_MAPLE_MONO_NF_CN,
  FONT_NOTO_CJK,
  FONT_WENKAI_SCREEN,
  SETTINGS_ITEMS,
  easeOutCubic,
} from "../ui-state.js";
import {HostNode, HostText, renderReactElement} from "./reconciler.js";

export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 240;
export const TIME_REGION: RectTuple = [0, 42, SCREEN_WIDTH, 142];
export const DIRTY_TILE_WIDTH = 24;
export const DIRTY_TILE_HEIGHT = 8;
export const SUPERSAMPLE_SCALE = 1;

export type RectTuple = [number, number, number, number];

export interface CanvasImage {
  width: number;
  height: number;
  rgba: Buffer;
}

export interface RenderedFrame {
  frameId: number;
  baseFrameId: number;
  fullFrame: boolean;
  rects: FrameRect[];
}

export interface HomeCopy {
  dateText: string;
  weekdayText: string;
  timeText: string;
  secondsText: string;
  greeting: string;
  subtitle: string;
}

interface RenderDeviceCanvasOptions {
  currentTime: Date;
  deviceId: string;
  buttonCount: number;
  uiState?: DeviceUiState;
  animationProgress?: number;
}

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
}

interface Style {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  padding?: number;
  flexDirection?: "row" | "column";
  alignItems?: "center" | "flex-start" | "flex-end";
  justifyContent?: "center" | "flex-start" | "flex-end" | "space-between";
  backgroundColor?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  fontSize?: number;
  fontFamily?: string;
  opacity?: number;
}

interface LayoutNode {
  host: HostNode | HostText;
  style: Style;
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
}

registerFonts();

export function renderDeviceView(options: RenderDeviceViewOptions): RenderedFrame {
  const image = renderDeviceCanvas({
    currentTime: options.now ?? new Date(),
    deviceId: options.deviceId,
    buttonCount: options.buttonCount,
    uiState: options.uiState,
    animationProgress: options.animationProgress,
  });
  return renderCanvasFrame(image, {
    frameId: options.frameId ?? 1,
    baseFrameId: options.baseFrameId ?? 0,
    fullFrame: options.fullFrame ?? true,
    regions: options.regions,
  });
}

export function renderCanvasFrame(
  image: CanvasImage,
  options: {frameId: number; baseFrameId?: number; fullFrame?: boolean; regions?: RectTuple[]},
): RenderedFrame {
  const fullFrame = options.fullFrame ?? true;
  const rects = fullFrame
    ? [compressRectIfSmaller(new FrameRect(0, 0, image.width, image.height, rgbaToRgb565(image.rgba)))]
    : (options.regions ?? [TIME_REGION]).map((region) => cropRect(image, region));

  return {
    frameId: options.frameId,
    baseFrameId: options.baseFrameId ?? 0,
    fullFrame,
    rects,
  };
}

export function renderDeviceCanvas(options: RenderDeviceCanvasOptions): CanvasImage {
  const state = options.uiState ?? new DeviceUiState();
  let fontKey = state.fontKey;
  if (state.page === "detail" && SETTINGS_ITEMS[state.detailIndex % SETTINGS_ITEMS.length] === "Font") {
    fontKey = state.pendingFontKey;
  }

  const page = renderPageCanvas(options.currentTime, options.deviceId, state, fontKey, options.animationProgress ?? 1);
  if (!["enter_settings", "enter_detail", "back_home", "back_to_settings"].includes(state.animation) || (options.animationProgress ?? 1) >= 1) {
    return page;
  }
  return pasteAnimatedPage(page, state, options.animationProgress ?? 1);
}

export function computeDirtyRects(previous: CanvasImage, current: CanvasImage, regions?: RectTuple[], padding = 2): FrameRect[] {
  if (previous.width !== current.width || previous.height !== current.height) {
    throw new Error("diff images must have the same size");
  }
  const dirtyRegions = regions ?? [[0, 0, current.width, current.height] as RectTuple];
  const rects: FrameRect[] = [];
  for (const region of dirtyRegions) {
    rects.push(...tileDirtyRects(previous, current, region, padding));
  }
  return rects;
}

export function buildHomeCopy(currentTime: Date): HomeCopy {
  const parts = getShanghaiParts(currentTime);
  return {
    dateText: `${chineseMonth(parts.month)}月${chineseDay(parts.day)}日`,
    weekdayText: chineseWeekday(parts.weekday),
    timeText: `${pad2(parts.hour)}:${pad2(parts.minute)}`,
    secondsText: `:${pad2(parts.second)}`,
    greeting: greetingForHour(parts.hour),
    subtitle: subtitleForHour(parts.hour),
  };
}

function renderPageCanvas(currentTime: Date, deviceId: string, state: DeviceUiState, fontKey: string, progress: number): CanvasImage {
  const element =
    state.page === "settings"
      ? settingsElement(state, fontKey, progress)
      : state.page === "detail"
        ? detailElement(state, deviceId, fontKey, progress)
        : homeElement(currentTime, fontKey);
  const root = renderReactElement(element);
  return rasterHostTree(root.children.filter((child): child is HostNode => child instanceof HostNode), fontKey);
}

function homeElement(currentTime: Date, fontKey: string): React.ReactElement {
  const copy = buildHomeCopy(currentTime);
  return React.createElement(
    "screen",
    {style: {width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: "#05080a", fontFamily: fontFamily(fontKey)}},
    frameBackground(),
    text(`${copy.dateText}  ${copy.weekdayText}`, {x: 0, y: 25, width: 240, height: 25, fontSize: 20, color: "#acc8c2", alignItems: "center"}),
    text(copy.timeText, {x: 22, y: 68, width: 154, height: 62, fontSize: 52, color: "#f0f8ee"}),
    text(copy.secondsText, {x: 174, y: 92, width: 48, height: 24, fontSize: 18, color: "#80dac6"}),
    text(copy.greeting, {x: 0, y: 140, width: 240, height: 24, fontSize: 18, color: "#cee8de", alignItems: "center"}),
    text(copy.subtitle, {x: 0, y: 166, width: 240, height: 20, fontSize: 16, color: "#7c9c9e", alignItems: "center"}),
  );
}

function settingsElement(state: DeviceUiState, fontKey: string, progress: number): React.ReactElement {
  const pulse = state.animation === "settings_select" ? Math.sin(Math.min(1, progress) * Math.PI) : 0;
  const children: React.ReactNode[] = [
    React.createElement("box", {key: "frame", style: {x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#2e3a46", borderWidth: 2}}),
    text("Settings", {x: 20, y: 18, width: 120, height: 30, fontSize: 24, color: "#ebf2e8"}, "title"),
    text("remote", {x: 166, y: 25, width: 58, height: 18, fontSize: 13, color: "#60a0ae"}, "remote"),
  ];
  SETTINGS_ITEMS.forEach((item, index) => {
    const y = 58 + index * 33;
    const selected = index === state.selectedIndex;
    children.push(
      React.createElement("box", {
        key: `row-${item}`,
        style: {
          x: 16,
          y: y - 2,
          width: 208,
          height: 32,
          borderRadius: 10,
          backgroundColor: selected ? mixColor("#1b6265", "#248b85", pulse * 0.6) : "#11181e",
        },
      }),
      text(String(index + 1), {x: 20, y: y + 6, width: 22, height: 18, fontSize: 13, color: selected ? "#0a2a2c" : "#587078", alignItems: "center"}, `idx-${item}`),
      text(item, {x: 54, y: y + 4, width: 116, height: 22, fontSize: 17, color: selected ? "#f4fcf4" : "#a5b7be"}, `label-${item}`),
    );
    if (item === "Brightness") children.push(text(`${state.brightness}%`, {x: 186, y: y + 6, width: 42, height: 18, fontSize: 13, color: "#a5b7be"}, "brightness"));
    if (item === "Font") children.push(text(FONT_LABELS[state.fontKey] ?? "Font", {x: 174, y: y + 6, width: 50, height: 18, fontSize: 13, color: "#a5b7be"}, "font"));
  });
  return React.createElement("screen", {style: screenStyle(fontKey, "#06090d")}, children);
}

function detailElement(state: DeviceUiState, deviceId: string, fontKey: string, progress: number): React.ReactElement {
  const item = SETTINGS_ITEMS[state.detailIndex % SETTINGS_ITEMS.length];
  if (item === "Brightness") return brightnessElement(state, fontKey, progress);
  if (item === "Device") return rowsDetailElement("Device", "client diagnostics", [
    ["Heap", state.diagnostics.heapFree ? formatKb(state.diagnostics.heapFree) : "waiting"],
    ["Block", state.diagnostics.heapMaxBlock ? formatKb(state.diagnostics.heapMaxBlock) : "waiting"],
    ["Frag", state.diagnostics.heapFragmentation ? `${state.diagnostics.heapFragmentation}%` : "waiting"],
    ["RSSI", state.diagnostics.wifiRssi ? `${state.diagnostics.wifiRssi} dBm` : "waiting"],
  ], fontKey);
  if (item === "Renderer") return rowsDetailElement("Renderer", "remote frame link", [["Mode", "HTTP keep-alive"], ["Poll", "50 ms"], ["Wait", "10 ms"], ["Frames", "SDD1 diff"]], fontKey);
  if (item === "About") return rowsDetailElement("About", "SmallDesktopDisplay", [["Device", deviceId.slice(0, 14)], ["UI", "react-render"], ["Build", "node"], ["Protocol", "SDD1"]], fontKey);
  if (item === "Font") return rowsDetailElement("Font", "short apply", [["Current", FONT_LABELS[state.fontKey] ?? "Font"], ["Next", FONT_LABELS[nextFontLabel(state.fontKey)] ?? "Font"], ["Engine", "React"], ["Layout", "Yoga"]], fontKey);
  return rowsDetailElement(item, "Setting detail", [["Preview", "only"], ["More", "controls next"]], fontKey);
}

function brightnessElement(state: DeviceUiState, fontKey: string, progress: number): React.ReactElement {
  const value = Math.max(0, Math.min(100, state.pendingBrightness));
  const pulse = ["brightness_adjust", "brightness_applied"].includes(state.animation) ? Math.sin(Math.min(1, progress) * Math.PI) : 0;
  const fillWidth = Math.round(170 * (value / 100));
  return React.createElement(
    "screen",
    {style: screenStyle(fontKey, "#05080a")},
    React.createElement("box", {style: {x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#323e48", borderWidth: 2}}),
    text("Brightness", {x: 20, y: 18, width: 160, height: 28, fontSize: 22, color: "#eef6ec"}),
    text("short apply", {x: 20, y: 49, width: 180, height: 18, fontSize: 13, color: "#649baa"}),
    text(`${value}%`, {x: 0, y: 82 - Math.round(pulse * 3), width: 240, height: 52, fontSize: 42, color: mixColor("#f0f8ee", "#b2ffe2", pulse * 0.45), alignItems: "center"}),
    React.createElement("box", {style: {x: 34, y: 146, width: 172, height: 18, borderRadius: 9, backgroundColor: "#111b20"}}),
    React.createElement("box", {style: {x: 35, y: 147, width: fillWidth, height: 16, borderRadius: 8, backgroundColor: "#70e0c4"}}),
    text(state.brightness === state.pendingBrightness ? "applied" : `saved ${state.brightness}%`, {x: 34, y: 184, width: 160, height: 22, fontSize: 16, color: "#8eb2b4"}),
    text("double tap back", {x: 0, y: 210, width: 240, height: 18, fontSize: 13, color: "#a0bec2", alignItems: "center"}),
  );
}

function rowsDetailElement(title: string, subtitle: string, rows: Array<[string, string]>, fontKey: string): React.ReactElement {
  return React.createElement(
    "screen",
    {style: screenStyle(fontKey, "#05080a")},
    React.createElement("box", {style: {x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#323e48", borderWidth: 2}}),
    text(title, {x: 20, y: 18, width: 190, height: 28, fontSize: 22, color: "#eef6ec"}),
    text(subtitle, {x: 20, y: 49, width: 190, height: 18, fontSize: 13, color: "#649baa"}),
    rows.map(([label, value], index) =>
      React.createElement(
        React.Fragment,
        {key: label},
        React.createElement("box", {style: {x: 18, y: 80 + index * 28, width: 204, height: 24, borderRadius: 8, backgroundColor: "#11181e"}}),
        text(label, {x: 28, y: 84 + index * 28, width: 60, height: 18, fontSize: 13, color: "#70969e"}),
        text(value, {x: 92, y: 82 + index * 28, width: 128, height: 20, fontSize: 16, color: "#e0f0e8"}),
      ),
    ),
    text("double tap back", {x: 0, y: 210, width: 240, height: 18, fontSize: 13, color: "#a0bec2", alignItems: "center"}),
  );
}

function frameBackground(): React.ReactElement[] {
  return [
    React.createElement("box", {key: "outer", style: {x: 8, y: 8, width: 224, height: 224, borderRadius: 14, backgroundColor: "#060a0d", borderColor: "#2a3a3e", borderWidth: 2}}),
    React.createElement("box", {key: "inner", style: {x: 16, y: 16, width: 208, height: 208, borderRadius: 11, borderColor: "#101f22", borderWidth: 1}}),
    React.createElement("box", {key: "line1", style: {x: 32, y: 55, width: 176, height: 1, backgroundColor: "#142627"}}),
    React.createElement("box", {key: "line2", style: {x: 42, y: 132, width: 156, height: 1, backgroundColor: "#122224"}}),
  ];
}

function text(value: string, style: Style, key?: string): React.ReactElement {
  return React.createElement("text", {key, style, text: value});
}

function screenStyle(fontKey: string, backgroundColor: string): Style {
  return {width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor, fontFamily: fontFamily(fontKey)};
}

function rasterHostTree(children: HostNode[], fontKey: string): CanvasImage {
  const canvas = createCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "top";
  for (const child of children) {
    const layout = layoutHostNode(child, ctx, fontKey);
    paintLayout(ctx, layout, 0, 0, fontFamily(fontKey));
  }
  return {width: SCREEN_WIDTH, height: SCREEN_HEIGHT, rgba: Buffer.from(canvas.data())};
}

function layoutHostNode(host: HostNode, ctx: SKRSContext2D, fontKey: string): LayoutNode {
  const yoga = Yoga.Node.create();
  applyYogaStyle(yoga, styleOf(host), host.type);
  for (const child of host.children) {
    const childYoga = Yoga.Node.create();
    if (child instanceof HostText) {
      const parentStyle = styleOf(host);
      ctx.font = `${parentStyle.fontSize ?? 16}px ${parentStyle.fontFamily ?? fontFamily(fontKey)}`;
      const metrics = ctx.measureText(child.text);
      childYoga.setWidth(Math.ceil(metrics.width));
      childYoga.setHeight(Math.ceil((parentStyle.fontSize ?? 16) * 1.3));
    } else {
      applyYogaStyle(childYoga, styleOf(child), child.type);
    }
    yoga.insertChild(childYoga, yoga.getChildCount());
  }
  yoga.calculateLayout(SCREEN_WIDTH, SCREEN_HEIGHT, Direction.LTR);
  const layout = readLayout(host, yoga);
  yoga.freeRecursive();
  return layout;
}

function readLayout(host: HostNode, yoga: YogaNode): LayoutNode {
  const computed = yoga.getComputedLayout();
  const children: LayoutNode[] = [];
  for (let index = 0; index < host.children.length; index += 1) {
    const child = host.children[index];
    const childYoga = yoga.getChild(index);
    const childComputed = childYoga.getComputedLayout();
    children.push({
      host: child,
      style: child instanceof HostNode ? styleOf(child) : {},
      x: childComputed.left,
      y: childComputed.top,
      width: childComputed.width,
      height: childComputed.height,
      children: child instanceof HostNode ? [] : [],
    });
    if (child instanceof HostNode) {
      children[index] = readLayout(child, childYoga);
    }
  }
  return {host, style: styleOf(host), x: computed.left, y: computed.top, width: computed.width, height: computed.height, children};
}

function paintLayout(ctx: SKRSContext2D, node: LayoutNode, parentX: number, parentY: number, inheritedFontFamily: string): void {
  const x = parentX + node.x;
  const y = parentY + node.y;
  if (node.host instanceof HostText) return;
  const currentFontFamily = node.style.fontFamily ?? inheritedFontFamily;

  if (node.style.backgroundColor) {
    fillRoundedRect(ctx, x, y, node.width, node.height, node.style.borderRadius ?? 0, node.style.backgroundColor);
  }
  if (node.style.borderColor && node.style.borderWidth) {
    strokeRoundedRect(ctx, x, y, node.width, node.height, node.style.borderRadius ?? 0, node.style.borderColor, node.style.borderWidth);
  }
  if (node.host.type === "text") {
    const textValue = collectText(node.host);
    const fontSize = node.style.fontSize ?? 16;
    ctx.font = `${fontSize}px ${currentFontFamily}`;
    ctx.fillStyle = node.style.color ?? "#ffffff";
    const metrics = ctx.measureText(textValue);
    let textX = x;
    if (node.style.alignItems === "center") {
      textX = x + Math.max(0, (node.width - metrics.width) / 2);
    }
    ctx.fillText(textValue, textX, y + Math.max(0, (node.height - fontSize * 1.1) / 2));
  }
  for (const child of node.children) {
    paintLayout(ctx, child, x, y, currentFontFamily);
  }
}

function collectText(node: HostNode): string {
  return node.props.text ?? node.children.map((child) => (child instanceof HostText ? child.text : collectText(child))).join("");
}

function applyYogaStyle(node: YogaNode, style: Style, type: string): void {
  node.setWidth(style.width ?? (type === "screen" ? SCREEN_WIDTH : 0));
  node.setHeight(style.height ?? (type === "screen" ? SCREEN_HEIGHT : 0));
  if (style.x !== undefined || style.y !== undefined) {
    node.setPositionType(PositionType.Absolute);
    node.setPosition(Yoga.EDGE_LEFT, style.x ?? 0);
    node.setPosition(Yoga.EDGE_TOP, style.y ?? 0);
  }
  if (style.padding !== undefined) {
    node.setPadding(Yoga.EDGE_ALL, style.padding);
  }
  node.setFlexDirection(style.flexDirection === "row" ? FlexDirection.Row : FlexDirection.Column);
  if (style.alignItems === "center") node.setAlignItems(Align.Center);
  if (style.alignItems === "flex-end") node.setAlignItems(Align.FlexEnd);
  if (style.justifyContent === "center") node.setJustifyContent(Justify.Center);
  if (style.justifyContent === "flex-end") node.setJustifyContent(Justify.FlexEnd);
  if (style.justifyContent === "space-between") node.setJustifyContent(Justify.SpaceBetween);
}

function styleOf(node: HostNode): Style {
  return (node.props.style ?? {}) as Style;
}

function fillRoundedRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number, color: string): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundedRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number, color: string, lineWidth: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function cropRect(image: CanvasImage, region: RectTuple): FrameRect {
  const [left, top, right, bottom] = region;
  const width = right - left;
  const height = bottom - top;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = ((top + y) * image.width + left) * 4;
    image.rgba.copy(rgba, y * width * 4, sourceOffset, sourceOffset + width * 4);
  }
  return compressRectIfSmaller(new FrameRect(left, top, width, height, rgbaToRgb565(rgba)));
}

function tileDirtyRects(previous: CanvasImage, current: CanvasImage, region: RectTuple, padding: number): FrameRect[] {
  const [left, top, right, bottom] = region;
  const rawRects: RectTuple[] = [];
  for (let y = top; y < bottom; y += DIRTY_TILE_HEIGHT) {
    const tileBottom = Math.min(y + DIRTY_TILE_HEIGHT, bottom);
    let runLeft: number | null = null;
    let runRight = left;
    for (let x = left; x < right; x += DIRTY_TILE_WIDTH) {
      const tileRight = Math.min(x + DIRTY_TILE_WIDTH, right);
      if (!tileChanged(previous, current, [x, y, tileRight, tileBottom])) {
        if (runLeft !== null) {
          rawRects.push(paddedRegion(runLeft, y, runRight, tileBottom, current.width, current.height, 0));
          runLeft = null;
        }
        continue;
      }
      if (runLeft === null) runLeft = x;
      runRight = tileRight;
    }
    if (runLeft !== null) {
      rawRects.push(paddedRegion(runLeft, y, runRight, tileBottom, current.width, current.height, 0));
    }
  }
  return rawRects.map((raw) => cropRect(current, paddedRegion(raw[0], raw[1], raw[2], raw[3], current.width, current.height, padding)));
}

function tileChanged(previous: CanvasImage, current: CanvasImage, region: RectTuple): boolean {
  const [left, top, right, bottom] = region;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * current.width + x) * 4;
      if (
        previous.rgba[offset] !== current.rgba[offset] ||
        previous.rgba[offset + 1] !== current.rgba[offset + 1] ||
        previous.rgba[offset + 2] !== current.rgba[offset + 2] ||
        previous.rgba[offset + 3] !== current.rgba[offset + 3]
      ) {
        return true;
      }
    }
  }
  return false;
}

function paddedRegion(left: number, top: number, right: number, bottom: number, width: number, height: number, padding: number): RectTuple {
  return [Math.max(0, left - padding), Math.max(0, top - padding), Math.min(width, right + padding), Math.min(height, bottom + padding)];
}

function pasteAnimatedPage(page: CanvasImage, state: DeviceUiState, progress: number): CanvasImage {
  const target = solidCanvas(SCREEN_WIDTH, SCREEN_HEIGHT, [5, 8, 10, 255]);
  const eased = easeOutCubic(progress);
  const direction = ["back_home", "back_to_settings"].includes(state.animation) ? -1 : 1;
  const offsetX = Math.round(direction * (1 - eased) * 18);
  const alpha = Math.round(120 + 135 * eased);
  for (let y = 0; y < page.height; y += 1) {
    for (let x = 0; x < page.width; x += 1) {
      const tx = x + offsetX;
      if (tx < 0 || tx >= target.width) continue;
      const src = (y * page.width + x) * 4;
      const dst = (y * target.width + tx) * 4;
      const a = alpha / 255;
      target.rgba[dst] = Math.round(page.rgba[src] * a + target.rgba[dst] * (1 - a));
      target.rgba[dst + 1] = Math.round(page.rgba[src + 1] * a + target.rgba[dst + 1] * (1 - a));
      target.rgba[dst + 2] = Math.round(page.rgba[src + 2] * a + target.rgba[dst + 2] * (1 - a));
      target.rgba[dst + 3] = 255;
    }
  }
  return target;
}

function solidCanvas(width: number, height: number, color: [number, number, number, number]): CanvasImage {
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = color[0];
    rgba[index + 1] = color[1];
    rgba[index + 2] = color[2];
    rgba[index + 3] = color[3];
  }
  return {width, height, rgba};
}

function registerFonts(): void {
  const candidates: Array<[string, string]> = [
    ["/usr/local/share/fonts/lxgw-wenkai-screen/LXGWWenKaiScreen.ttf", "LXGW WenKai Screen"],
    [path.join(process.env.HOME ?? "", "Library/Fonts/LXGWWenKaiScreen.ttf"), "LXGW WenKai Screen"],
    ["/usr/local/share/fonts/maple-mono-nf-cn/MapleMono-NF-CN-Regular.ttf", "Maple Mono NF CN"],
    [path.join(process.env.HOME ?? "", "Library/Fonts/MapleMono-NF-CN-Regular.ttf"), "Maple Mono NF CN"],
    ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK"],
    ["/System/Library/Fonts/PingFang.ttc", "PingFang SC"],
    ["/System/Library/Fonts/STHeiti Light.ttc", "STHeiti"],
  ];
  for (const [fontPath, name] of candidates) {
    try {
      GlobalFonts.registerFromPath(fontPath, name);
    } catch {
      // Missing optional font paths are expected across host and container environments.
    }
  }
}

function fontFamily(fontKey: string): string {
  if (fontKey === FONT_MAPLE_MONO_NF_CN) return '"Maple Mono NF CN", "Noto Sans CJK", "PingFang SC", "STHeiti", sans-serif';
  if (fontKey === FONT_NOTO_CJK) return '"Noto Sans CJK", "PingFang SC", "STHeiti", sans-serif';
  return '"LXGW WenKai Screen", "Noto Sans CJK", "PingFang SC", "STHeiti", sans-serif';
}

function nextFontLabel(fontKey: string): string {
  if (fontKey === FONT_WENKAI_SCREEN) return FONT_MAPLE_MONO_NF_CN;
  if (fontKey === FONT_MAPLE_MONO_NF_CN) return FONT_NOTO_CJK;
  return FONT_WENKAI_SCREEN;
}

function getShanghaiParts(date: Date): {month: number; day: number; weekday: number; hour: number; minute: number; second: number} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const weekdayMap: Record<string, number> = {Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6};
  return {
    month: value("month"),
    day: value("day"),
    weekday: weekdayMap[parts.find((part) => part.type === "weekday")?.value ?? "Mon"] ?? 0,
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function chineseMonth(month: number): string {
  return ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"][Math.max(1, Math.min(12, month)) - 1];
}

function chineseDay(day: number): string {
  return chineseNumber(Math.max(1, Math.min(31, day)));
}

function chineseNumber(value: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value <= 10) return value === 10 ? "十" : digits[value];
  if (value < 20) return `十${digits[value - 10]}`;
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return ones === 0 ? `${digits[tens]}十` : `${digits[tens]}十${digits[ones]}`;
}

function chineseWeekday(weekday: number): string {
  return ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"][Math.max(0, Math.min(6, weekday))];
}

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 14) return "中午好";
  if (hour >= 14 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 23) return "晚上好";
  return "夜深了";
}

function subtitleForHour(hour: number): string {
  if (hour >= 5 && hour < 11) return "今天也慢慢开始";
  if (hour >= 11 && hour < 14) return "记得好好吃饭";
  if (hour >= 14 && hour < 18) return "保持清醒，慢慢来";
  if (hour >= 18 && hour < 23) return "收一收，缓一缓";
  return "早点休息也很好";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatKb(value: number): string {
  return `${Math.round(value / 1024)} KB`;
}

function mixColor(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const t = Math.max(0, Math.min(1, amount));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

function parseHex(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}
