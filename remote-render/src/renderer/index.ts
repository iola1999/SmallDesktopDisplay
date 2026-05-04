import {createCanvas, type SKRSContext2D} from "@napi-rs/canvas";
import Yoga, {Align, Direction, FlexDirection, Justify, PositionType} from "yoga-layout";
import type {Node as YogaNode} from "yoga-layout";

import {FrameRect, compressRectIfSmaller, rgbaToRgb565} from "../protocol.js";
import {DeviceUiState, easeOutCubic} from "../ui-state.js";
import {DIRTY_TILE_HEIGHT, DIRTY_TILE_WIDTH, SCREEN_HEIGHT, SCREEN_WIDTH, TIME_REGION, type RectTuple} from "./constants.js";
import {buildHomeCopy} from "./copy.js";
import {fontFamily, registerFonts} from "./fonts.js";
import {HostNode, HostText, renderReactElement} from "./reconciler.js";
import type {CanvasImage, RenderedFrame, Style} from "./types.js";
import {DeviceView, fontKeyForView} from "./view.js";

export {SCREEN_HEIGHT, SCREEN_WIDTH, TIME_REGION} from "./constants.js";
export {buildHomeCopy} from "./copy.js";
export type {RectTuple} from "./constants.js";
export type {CanvasImage, RenderedFrame} from "./types.js";

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
  const fontKey = fontKeyForView(state);

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

function renderPageCanvas(currentTime: Date, deviceId: string, state: DeviceUiState, fontKey: string, progress: number): CanvasImage {
  const element = DeviceView({currentTime, deviceId, state, fontKey, progress});
  const root = renderReactElement(element);
  return rasterHostTree(root.children.filter((child): child is HostNode => child instanceof HostNode), fontKey);
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
  if (node.host.type === "sdd-text") {
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
  node.setWidth(style.width ?? (type === "sdd-screen" ? SCREEN_WIDTH : 0));
  node.setHeight(style.height ?? (type === "sdd-screen" ? SCREEN_HEIGHT : 0));
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
