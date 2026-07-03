import {describe, expect, test} from "vitest";

import {DIRTY_TILE_HEIGHT} from "../constants.js";
import type {CanvasImage} from "../types.js";
import {computeDirtyRects} from "./dirty-rects.js";

const WIDTH = 48;
const HEIGHT = 64;

function blankImage(): CanvasImage {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let index = 3; index < rgba.length; index += 4) rgba[index] = 255;
  return {width: WIDTH, height: HEIGHT, rgba};
}

function paint(image: CanvasImage, x: number, y: number, w: number, h: number): void {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      image.rgba[(row * WIDTH + col) * 4] = 200;
    }
  }
}

describe("computeDirtyRects vertical merge", () => {
  test("a tall glyph-like change becomes one rect instead of one per tile band", () => {
    const previous = blankImage();
    const current = blankImage();
    // 高 40px 的变化跨 5 个 8px 条带，x 范围一致 → 应合并为 1 个 rect。
    paint(current, 4, 8, 10, 40);

    const rects = computeDirtyRects(previous, current);

    expect(rects).toHaveLength(1);
    expect(rects[0].y).toBeLessThanOrEqual(8);
    expect(rects[0].y + rects[0].height).toBeGreaterThanOrEqual(48);
  });

  test("merging removes the per-band double-draw of a tall change", () => {
    const previous = blankImage();
    const current = blankImage();
    paint(current, 4, 8, 10, 40);

    const rects = computeDirtyRects(previous, current);

    // 未合并时 5 个条带各 8px + 每个 ±2 padding = 60 行；合并后是一个 40+4=44 行的矩形。
    const totalRows = rects.reduce((sum, rect) => sum + rect.height, 0);
    expect(totalRows).toBeLessThanOrEqual(44);
  });

  test("bands separated by a clean gap stay separate", () => {
    const previous = blankImage();
    const current = blankImage();
    // 两处变化之间隔了 2 个干净条带，不应被合并。
    paint(current, 4, 0, 10, 4);
    paint(current, 4, 4 * DIRTY_TILE_HEIGHT, 10, 4);

    const rects = computeDirtyRects(previous, current);

    expect(rects).toHaveLength(2);
  });

  test("covers every changed pixel exactly like the unmerged diff", () => {
    const previous = blankImage();
    const current = blankImage();
    paint(current, 2, 3, 7, 30);
    paint(current, 26, 40, 12, 20);

    const rects = computeDirtyRects(previous, current);

    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const changed = current.rgba[(y * WIDTH + x) * 4] !== previous.rgba[(y * WIDTH + x) * 4];
        if (!changed) continue;
        const covered = rects.some(
          (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
        );
        expect(covered).toBe(true);
      }
    }
  });
});
