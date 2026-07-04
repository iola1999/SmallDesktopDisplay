import path from "node:path";
import {GlobalFonts} from "@napi-rs/canvas";

import {FONT_MAPLE_MONO_NF_CN, FONT_NOTO_CJK} from "../../ui-state.js";

// 彩色 emoji 字体用于天气图标（比图元手绘精致得多）。容器里装 Noto Color Emoji，
// macOS host 用系统 Apple Color Emoji；都没有时 WeatherIcon 回退到图元画法。
let emojiFontRegistered = false;
// 实际注册成功的 emoji 字族：Noto（容器）与 Apple（macOS 原生）字形基线
// 差异明显，WeatherIcon 的垂直补偿必须按字族取值。
let registeredEmojiFamily: "Noto Color Emoji" | "Apple Color Emoji" | null = null;

// 记录实际注册成功的正文字族名，供测试判断“换字体是否真的换了像素”——
// 缺字体的环境（如未装 CJK 字体的 CI）两个 fontKey 会回退到同一族，像素相同。
const registeredTextFamilies = new Set<string>();

export function hasEmojiFont(): boolean {
  return emojiFontRegistered;
}

export function emojiFontFamilyName(): "Noto Color Emoji" | "Apple Color Emoji" | null {
  return registeredEmojiFamily;
}

function primaryTextFamily(fontKey: string): string {
  if (fontKey === FONT_MAPLE_MONO_NF_CN) return "Maple Mono NF CN";
  if (fontKey === FONT_NOTO_CJK) return "Noto Sans CJK";
  return "LXGW WenKai Screen";
}

// fontKey 对应的首选字族是否真的注册成功（文件存在且被 canvas 接受）。
export function hasTextFont(fontKey: string): boolean {
  return registeredTextFamilies.has(primaryTextFamily(fontKey));
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
      if (GlobalFonts.registerFromPath(fontPath, name)) {
        registeredTextFamilies.add(name);
      }
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
        if (!emojiFontRegistered) {
          registeredEmojiFamily = name as "Noto Color Emoji" | "Apple Color Emoji";
        }
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
