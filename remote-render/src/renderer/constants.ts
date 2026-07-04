export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 240;
// 安静首屏分区：顶部（日期+农历）/ 时钟带 / 下方天气区（当前条+逐小时+两日）。
export const HEADER_REGION: RectTuple = [0, 8, SCREEN_WIDTH, 44];
export const TIME_REGION: RectTuple = [0, 44, SCREEN_WIDTH, 112];
// 边框移除后底部内容（明后天高低温）下探到 ~229，diff 区域覆盖到屏幕底缘。
export const FORECAST_REGION: RectTuple = [0, 112, SCREEN_WIDTH, 240];
export const DIRTY_TILE_WIDTH = 24;
export const DIRTY_TILE_HEIGHT = 8;
// 超采样倍率：2 = 以 480x480 光栅化后高质量缩回 240x240（小字 CJK 抗锯齿明显更顺）。
// 光栅像素量 x4，实测整帧约 1.5ms -> ~5ms，峰值 8 帧/秒时 ~4% 单核，可接受。
export const SUPERSAMPLE_SCALE: number = 2;

export type RectTuple = [number, number, number, number];
