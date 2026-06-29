export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 240;
// 安静首屏分区：顶部（日期+当前天气）/ 时钟带 / 下方 12h 预报。
export const HEADER_REGION: RectTuple = [0, 8, SCREEN_WIDTH, 42];
export const TIME_REGION: RectTuple = [0, 42, SCREEN_WIDTH, 142];
export const FORECAST_REGION: RectTuple = [0, 142, SCREEN_WIDTH, 232];
// 游戏轮播页分区：顶部大时间 / 下方大游戏区。
export const GAME_TIME_REGION: RectTuple = [0, 8, SCREEN_WIDTH, 64];
export const GAME_AREA_REGION: RectTuple = [0, 64, SCREEN_WIDTH, 232];
export const DIRTY_TILE_WIDTH = 24;
export const DIRTY_TILE_HEIGHT = 8;
export const SUPERSAMPLE_SCALE = 1;

export type RectTuple = [number, number, number, number];
