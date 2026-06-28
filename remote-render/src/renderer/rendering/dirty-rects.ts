import type {FrameRect} from "../../protocol.js";
import {DIRTY_TILE_HEIGHT, DIRTY_TILE_WIDTH, type RectTuple} from "../constants.js";
import type {CanvasImage} from "../types.js";
import {cropRect} from "./canvas-frame.js";

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
  const rowBytes = (right - left) * 4;
  // 每行是连续内存，用原生 Buffer.compare 比对（memcmp）而非逐像素 JS 循环。
  for (let y = top; y < bottom; y += 1) {
    const offset = (y * current.width + left) * 4;
    if (previous.rgba.compare(current.rgba, offset, offset + rowBytes, offset, offset + rowBytes) !== 0) {
      return true;
    }
  }
  return false;
}

function paddedRegion(left: number, top: number, right: number, bottom: number, width: number, height: number, padding: number): RectTuple {
  return [Math.max(0, left - padding), Math.max(0, top - padding), Math.min(width, right + padding), Math.min(height, bottom + padding)];
}
