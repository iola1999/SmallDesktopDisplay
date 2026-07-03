import {describe, expect, test} from "vitest";

import {applyPanelColorProfile} from "./panel-profile.js";

function pixel(r: number, g: number, b: number): Buffer {
  return Buffer.from([r, g, b, 255]);
}

describe("panel color profile", () => {
  test("keeps neutral gray neutral (only lifts it)", () => {
    const out = applyPanelColorProfile(pixel(64, 64, 64));
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
    expect(out[0]).toBeGreaterThanOrEqual(64); // 暗部 gamma 只会提亮
  });

  test("boosts chroma of a muted pink instead of flattening it", () => {
    const input = pixel(224, 139, 176); // sakura seconds 附近的色值
    const out = applyPanelColorProfile(input);
    const chromaIn = Math.max(224, 139, 176) - Math.min(224, 139, 176);
    const chromaOut = Math.max(out[0], out[1], out[2]) - Math.min(out[0], out[1], out[2]);
    expect(chromaOut).toBeGreaterThan(chromaIn);
  });

  test("keeps dark theme tints distinguishable after quantization", () => {
    // sakura 背景 #120a10：原值 5bit 量化后 R/B 几乎同灰。补偿后应保住色相差。
    const out = applyPanelColorProfile(pixel(18, 10, 16));
    expect(out[0]).toBeGreaterThan(out[1]); // R > G 的粉紫倾向仍在且被放大
    expect(out[0] - out[1]).toBeGreaterThanOrEqual(18 - 10);
  });

  test("is deterministic and clamps to bytes", () => {
    const input = pixel(250, 5, 250);
    const first = applyPanelColorProfile(input);
    const second = applyPanelColorProfile(input);
    expect(Buffer.compare(first, second)).toBe(0);
    for (const value of first) expect(value).toBeLessThanOrEqual(255);
    expect(first[3]).toBe(255);
  });
});
