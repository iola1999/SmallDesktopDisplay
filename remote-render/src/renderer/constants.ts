export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 240;
// 首屏分区：顶部（日期+当前天气）/ 时钟带 / 12h 预报条 / 环境游戏。
export const HEADER_REGION: RectTuple = [0, 8, SCREEN_WIDTH, 42];
export const TIME_REGION: RectTuple = [0, 42, SCREEN_WIDTH, 142];
export const FORECAST_REGION: RectTuple = [0, 142, SCREEN_WIDTH, 148];
export const HOME_GAME_REGION: RectTuple = [18, 146, 222, 232];
export const DIRTY_TILE_WIDTH = 24;
export const DIRTY_TILE_HEIGHT = 8;
export const SUPERSAMPLE_SCALE = 1;

export type RectTuple = [number, number, number, number];
