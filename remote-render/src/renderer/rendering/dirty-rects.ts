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
  return mergeVerticalRuns(rawRects).map((raw) =>
    cropRect(current, paddedRegion(raw[0], raw[1], raw[2], raw[3], current.width, current.height, padding)),
  );
}

// 把同一 x 范围、上下相接的条带合并成一个矩形（时钟字形 / 温度数字的典型变化形状）。
// 不合并的话，一个 60px 高的字形会拆成 8 个条带 rect，加上 ±2 padding 后相邻条带
// 互相重叠——设备端同一像素每帧要画两次，还要多付 7 个 rect 头与地址窗口切换。
function mergeVerticalRuns(rects: RectTuple[]): RectTuple[] {
  const merged: RectTuple[] = [];
  for (const rect of rects) {
    const previous = merged.find(
      (candidate) => candidate[0] === rect[0] && candidate[2] === rect[2] && candidate[3] === rect[1],
    );
    if (previous) {
      previous[3] = rect[3];
      continue;
    }
    merged.push([rect[0], rect[1], rect[2], rect[3]]);
  }
  return merged;
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
