export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 240;
// 安静首屏分区：顶部（日期+农历）/ 时钟带 / 下方天气区（当前条+逐小时+两日）。
export const HEADER_REGION: RectTuple = [0, 8, SCREEN_WIDTH, 44];
export const TIME_REGION: RectTuple = [0, 44, SCREEN_WIDTH, 124];
export const FORECAST_REGION: RectTuple = [0, 124, SCREEN_WIDTH, 232];
export const DIRTY_TILE_WIDTH = 24;
export const DIRTY_TILE_HEIGHT = 8;
export const SUPERSAMPLE_SCALE = 1;

export type RectTuple = [number, number, number, number];
