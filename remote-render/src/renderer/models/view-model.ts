import type {HomeCopy} from "../types.js";

export type DeviceViewModel = HomeViewModel | SettingsViewModel | DetailViewModel;

export interface BaseViewModel {
  fontKey: string;
}

export interface HomeViewModel extends BaseViewModel {
  page: "home";
  copy: HomeCopy;
  clockGlyphs: ClockFlipGlyphViewModel[];
  game: HomeAmbientGameViewModel;
}

export type ClockFlipGlyphGroup = "time" | "seconds";

export interface ClockFlipGlyphViewModel {
  key: string;
  group: ClockFlipGlyphGroup;
  char: string;
  previousChar: string;
  progress: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
}

export interface AutoSnakeViewModel {
  columns: number;
  rows: number;
  cellSize: number;
  body: SnakeCellViewModel[];
  food: SnakeCellViewModel;
}

export interface SnakeCellViewModel {
  x: number;
  y: number;
}

export type HomeAmbientGameViewModel =
  | {
      kind: "snake";
      snake: AutoSnakeViewModel;
    }
  | {
      kind: "life";
      life: ConwayLifeViewModel;
    }
  | {
      kind: "breakout";
      breakout: AutoBreakoutViewModel;
    }
  | {
      kind: "ants";
      ants: AntColonyViewModel;
    }
  | {
      kind: "pacman";
      pacman: AutoPacmanViewModel;
    };

export interface ConwayLifeViewModel {
  columns: number;
  rows: number;
  cellSize: number;
  alive: SnakeCellViewModel[];
}

export interface AutoBreakoutViewModel {
  width: number;
  height: number;
  bricks: BreakoutBrickViewModel[];
  balls: BreakoutBallViewModel[];
  drops: BreakoutDropViewModel[];
  paddle: BreakoutPaddleViewModel;
}

export interface AntColonyViewModel {
  columns: number;
  rows: number;
  cellSize: number;
  nest: SnakeCellViewModel;
  ants: AntViewModel[];
  food: SnakeCellViewModel[];
  pheromones: AntPheromoneViewModel[];
  delivered: number;
}

export interface AntViewModel extends SnakeCellViewModel {
  carrying: boolean;
}

export interface AntPheromoneViewModel extends SnakeCellViewModel {
  level: number;
}

export interface AutoPacmanViewModel {
  columns: number;
  rows: number;
  cellSize: number;
  pacman: PacmanViewModel;
  ghosts: GhostViewModel[];
  walls: SnakeCellViewModel[];
  pellets: SnakeCellViewModel[];
}

export interface PacmanViewModel extends SnakeCellViewModel {
  direction: SnakeCellViewModel;
  mouthOpen: boolean;
}

export interface GhostViewModel extends SnakeCellViewModel {
  color: string;
}

export interface BreakoutBrickViewModel {
  x: number;
  y: number;
  width: number;
  height: number;
  strength: number;
}

export interface BreakoutBallViewModel {
  x: number;
  y: number;
  radius: number;
}

export interface BreakoutDropViewModel {
  x: number;
  y: number;
  size: number;
}

export interface BreakoutPaddleViewModel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SettingsViewModel extends BaseViewModel {
  page: "settings";
  pulse: number;
  rows: SettingsRowViewModel[];
}

export interface SettingsRowViewModel {
  key: string;
  indexLabel: string;
  label: string;
  selected: boolean;
  value?: string;
  valueWidth?: number;
  valueX?: number;
}

export type DetailViewModel = BrightnessDetailViewModel | RowsDetailViewModel;

export interface BrightnessDetailViewModel extends BaseViewModel {
  page: "detail";
  kind: "brightness";
  title: string;
  subtitle: string;
  valueLabel: string;
  appliedLabel: string;
  fillWidth: number;
  pulse: number;
}

export interface RowsDetailViewModel extends BaseViewModel {
  page: "detail";
  kind: "rows";
  title: string;
  subtitle: string;
  rows: DetailRowViewModel[];
}

export interface DetailRowViewModel {
  label: string;
  value: string;
}
