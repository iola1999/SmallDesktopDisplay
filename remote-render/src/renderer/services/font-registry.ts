import path from "node:path";
import {GlobalFonts} from "@napi-rs/canvas";

import {FONT_MAPLE_MONO_NF_CN, FONT_NOTO_CJK} from "../../ui-state.js";

// 彩色 emoji 字体用于天气图标（比图元手绘精致得多）。容器里装 Noto Color Emoji，
// macOS host 用系统 Apple Color Emoji；都没有时 WeatherIcon 回退到图元画法。
let emojiFontRegistered = false;

export function hasEmojiFont(): boolean {
  return emojiFontRegistered;
}

export const EMOJI_FONT_FAMILY = '"Noto Color Emoji", "Apple Color Emoji"';

export function registerFonts(): void {
  const candidates: Array<[string, string]> = [
    ["/usr/local/share/fonts/lxgw-wenkai-screen/LXGWWenKaiScreen.ttf", "LXGW WenKai Screen"],
    [path.join(process.env.HOME ?? "", "Library/Fonts/LXGWWenKaiScreen.ttf"), "LXGW WenKai Screen"],
    // GB 子集发行版的文件名变体：注册为同一族名，保证 host 预览与设备字体一致。
    ["/usr/local/share/fonts/lxgw-wenkai-screen/LXGWWenKaiGBScreen.ttf", "LXGW WenKai Screen"],
    [path.join(process.env.HOME ?? "", "Library/Fonts/LXGWWenKaiGBScreen.ttf"), "LXGW WenKai Screen"],
    [path.join(process.env.HOME ?? "", "Library/Fonts/LXGWWenKai-Regular.ttf"), "LXGW WenKai Screen"],
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

  const emojiCandidates: Array<[string, string]> = [
    ["/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf", "Noto Color Emoji"],
    ["/System/Library/Fonts/Apple Color Emoji.ttc", "Apple Color Emoji"],
  ];
  for (const [fontPath, name] of emojiCandidates) {
    try {
      if (GlobalFonts.registerFromPath(fontPath, name)) {
        emojiFontRegistered = true;
      }
    } catch {
      // 可选字体，缺失时走图元回退。
    }
  }
}

export function fontFamily(fontKey: string): string {
  if (fontKey === FONT_MAPLE_MONO_NF_CN) return '"Maple Mono NF CN", "Noto Sans CJK", "PingFang SC", "STHeiti", sans-serif';
  if (fontKey === FONT_NOTO_CJK) return '"Noto Sans CJK", "PingFang SC", "STHeiti", sans-serif';
  return '"LXGW WenKai Screen", "Noto Sans CJK", "PingFang SC", "STHeiti", sans-serif';
}
