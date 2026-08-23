import type {DeviceConfig, DeviceConfigDocument, HomeLayout} from "./types";

export interface DraftState {
  document: DeviceConfigDocument | null;
  config: DeviceConfig | null;
  dirty: boolean;
  conflict: boolean;
}

export type DraftAction =
  | {type: "clear"}
  | {type: "hydrate"; document: DeviceConfigDocument}
  | {type: "rebase"; document: DeviceConfigDocument}
  | {type: "set-theme"; value: string}
  | {type: "set-font"; value: string}
  | {type: "set-layout"; value: HomeLayout}
  | {type: "set-home-flag"; group: "header" | "weather"; key: string; value: boolean}
  | {type: "reset"}
  | {type: "saved"; document: DeviceConfigDocument; sentConfig: DeviceConfig}
  | {type: "conflict"; value: boolean};

export const initialDraftState: DraftState = {
  document: null,
  config: null,
  dirty: false,
  conflict: false,
};

function sameConfig(left: DeviceConfig, right: DeviceConfig): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withConfig(state: DraftState, config: DeviceConfig): DraftState {
  if (!state.document) return state;
  return {
    ...state,
    config,
    dirty: !sameConfig(config, state.document.config),
    conflict: state.conflict,
  };
}

function rebaseConfig(
  previous: DeviceConfig,
  local: DeviceConfig,
  current: DeviceConfig,
): DeviceConfig {
  return {
    ...current,
    appearance: {
      ...current.appearance,
      themeKey:
        local.appearance.themeKey === previous.appearance.themeKey
          ? current.appearance.themeKey
          : local.appearance.themeKey,
      fontKey:
        local.appearance.fontKey === previous.appearance.fontKey
          ? current.appearance.fontKey
          : local.appearance.fontKey,
    },
    home: {
      ...current.home,
      layout: local.home.layout === previous.home.layout ? current.home.layout : local.home.layout,
      header: {
        ...current.home.header,
        showDate:
          local.home.header.showDate === previous.home.header.showDate
            ? current.home.header.showDate
            : local.home.header.showDate,
        showLunar:
          local.home.header.showLunar === previous.home.header.showLunar
            ? current.home.header.showLunar
            : local.home.header.showLunar,
      },
      weather: {
        ...current.home.weather,
        showCurrent:
          local.home.weather.showCurrent === previous.home.weather.showCurrent
            ? current.home.weather.showCurrent
            : local.home.weather.showCurrent,
        showTodayRange:
          local.home.weather.showTodayRange === previous.home.weather.showTodayRange
            ? current.home.weather.showTodayRange
            : local.home.weather.showTodayRange,
        showDailyOutlook:
          local.home.weather.showDailyOutlook === previous.home.weather.showDailyOutlook
            ? current.home.weather.showDailyOutlook
            : local.home.weather.showDailyOutlook,
      },
    },
  };
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "clear":
      return initialDraftState;
    case "hydrate": {
      const sameDevice = state.document?.deviceId === action.document.deviceId;
      if (sameDevice && state.document && state.document.revision >= action.document.revision) {
        return state;
      }
      if (sameDevice && state.document && state.config && state.dirty) {
        const config = rebaseConfig(state.document.config, state.config, action.document.config);
        const dirty = !sameConfig(config, action.document.config);
        return {document: action.document, config, dirty, conflict: dirty};
      }
      return {document: action.document, config: action.document.config, dirty: false, conflict: false};
    }
    case "rebase": {
      if (!state.document || !state.config || state.document.deviceId !== action.document.deviceId) {
        return {document: action.document, config: action.document.config, dirty: false, conflict: false};
      }
      if (action.document.revision < state.document.revision) return state;
      const config = rebaseConfig(state.document.config, state.config, action.document.config);
      return {
        document: action.document,
        config,
        dirty: !sameConfig(config, action.document.config),
        conflict: false,
      };
    }
    case "set-theme":
      if (!state.config) return state;
      return withConfig(state, {
        ...state.config,
        appearance: {...state.config.appearance, themeKey: action.value},
      });
    case "set-font":
      if (!state.config) return state;
      return withConfig(state, {
        ...state.config,
        appearance: {...state.config.appearance, fontKey: action.value},
      });
    case "set-layout":
      if (!state.config) return state;
      return withConfig(state, {
        ...state.config,
        home: {...state.config.home, layout: action.value},
      });
    case "set-home-flag":
      if (!state.config) return state;
      return withConfig(state, {
        ...state.config,
        home: {
          ...state.config.home,
          [action.group]: {
            ...state.config.home[action.group],
            [action.key]: action.value,
          },
        },
      });
    case "reset":
      if (!state.document) return state;
      return {...state, config: state.document.config, dirty: false, conflict: false};
    case "saved": {
      if (state.document && state.document.deviceId !== action.document.deviceId) return state;
      if (state.document && action.document.revision < state.document.revision) return state;
      if (!state.config) {
        return {document: action.document, config: action.document.config, dirty: false, conflict: false};
      }
      const config = rebaseConfig(action.sentConfig, state.config, action.document.config);
      return {
        document: action.document,
        config,
        dirty: !sameConfig(config, action.document.config),
        conflict: false,
      };
    }
    case "conflict":
      return {...state, conflict: action.value};
  }
}
