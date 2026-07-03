import {createCanvas} from "@napi-rs/canvas";

import type {CanvasImage} from "../types.js";

// 把渲染帧编码为 PNG，供 Web 控制台的实时预览使用。
export function encodeCanvasImagePng(image: CanvasImage): Buffer {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  const data = ctx.createImageData(image.width, image.height);
  data.data.set(image.rgba);
  ctx.putImageData(data, 0, 0);
  return canvas.encodeSync("png");
}
