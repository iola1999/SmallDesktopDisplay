import {easeOutCubic} from "../../ui-state.js";
import {SCREEN_HEIGHT, SCREEN_WIDTH} from "../constants.js";
import type {CanvasImage} from "../types.js";

const PAGE_SLIDE_ANIMATIONS = new Set(["enter_settings", "enter_detail", "back_home", "back_to_settings"]);

export function shouldPasteAnimatedPage(animation: string, progress: number): boolean {
  return PAGE_SLIDE_ANIMATIONS.has(animation) && progress < 1;
}

export function pasteAnimatedPage(page: CanvasImage, animation: string, progress: number): CanvasImage {
  const target = solidCanvas(SCREEN_WIDTH, SCREEN_HEIGHT, [5, 8, 10, 255]);
  const eased = easeOutCubic(progress);
  const direction = ["back_home", "back_to_settings"].includes(animation) ? -1 : 1;
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
