import path from "node:path";
import {GlobalFonts} from "@napi-rs/canvas";

import {FONT_MAPLE_MONO_NF_CN, FONT_NOTO_CJK, FONT_WENKAI_SCREEN} from "../../ui-state.js";

export function registerFonts(): void {
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

export function fontFamily(fontKey: string): string {
  if (fontKey === FONT_MAPLE_MONO_NF_CN) return '"Maple Mono NF CN", "Noto Sans CJK", "PingFang SC", "STHeiti", sans-serif';
  if (fontKey === FONT_NOTO_CJK) return '"Noto Sans CJK", "PingFang SC", "STHeiti", sans-serif';
  return '"LXGW WenKai Screen", "Noto Sans CJK", "PingFang SC", "STHeiti", sans-serif';
}

export function nextFontLabel(fontKey: string): string {
  if (fontKey === FONT_WENKAI_SCREEN) return FONT_MAPLE_MONO_NF_CN;
  if (fontKey === FONT_MAPLE_MONO_NF_CN) return FONT_NOTO_CJK;
  return FONT_WENKAI_SCREEN;
}
