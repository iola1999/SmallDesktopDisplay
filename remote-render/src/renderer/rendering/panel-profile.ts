// ST7789 实机色彩补偿：小面板色域窄、暗部压缩重，直接下发 sRGB 原值会显得发灰
// （樱粉在屏上偏灰就是这个原因）。在 RGBA -> RGB565 转换前做两步补偿，
// 只影响发给设备的帧；Web 控制台预览走的是转换前的 canvas，保持设计原色。
//  1) 以亮度为轴放大饱和度（默认 1.35 倍）
//  2) 暗部 gamma 提升（默认 1/1.15），让深色主题的色相撑过 565 量化
// 想微调观感：改环境变量 PANEL_SATURATION / PANEL_GAMMA 后 docker compose up -d 即可。
const saturation = clampNumber(Number(process.env.PANEL_SATURATION ?? "1.35"), 1, 2);
const gamma = clampNumber(Number(process.env.PANEL_GAMMA ?? "1.15"), 1, 1.8);

const GAMMA_LUT = new Uint8Array(256);
for (let index = 0; index < 256; index += 1) {
  GAMMA_LUT[index] = Math.round(255 * Math.pow(index / 255, 1 / gamma));
}

export function applyPanelColorProfile(rgba: Buffer): Buffer {
  const out = Buffer.allocUnsafe(rgba.length);
  for (let index = 0; index < rgba.length; index += 4) {
    const r = rgba[index];
    const g = rgba[index + 1];
    const b = rgba[index + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    out[index] = GAMMA_LUT[clampByte(luma + (r - luma) * saturation)];
    out[index + 1] = GAMMA_LUT[clampByte(luma + (g - luma) * saturation)];
    out[index + 2] = GAMMA_LUT[clampByte(luma + (b - luma) * saturation)];
    out[index + 3] = 255;
  }
  return out;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
