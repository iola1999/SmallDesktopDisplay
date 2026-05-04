import {FrameRect, compressRectIfSmaller, rgbaToRgb565} from "../../protocol.js";
import {TIME_REGION, type RectTuple} from "../constants.js";
import type {CanvasImage, RenderedFrame} from "../types.js";

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

export function cropRect(image: CanvasImage, region: RectTuple): FrameRect {
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
