import {SETTINGS_ITEMS, type DeviceUiState} from "../ui-state.js";
import {DetailPage} from "./pages/detail.js";
import {HomePage} from "./pages/home.js";
import {SettingsPage} from "./pages/settings.js";

export function DeviceView({
  currentTime,
  deviceId,
  state,
  fontKey,
  progress,
}: {
  currentTime: Date;
  deviceId: string;
  state: DeviceUiState;
  fontKey: string;
  progress: number;
}) {
  if (state.page === "settings") return <SettingsPage state={state} fontKey={fontKey} progress={progress} />;
  if (state.page === "detail") return <DetailPage state={state} deviceId={deviceId} fontKey={fontKey} progress={progress} />;
  return <HomePage currentTime={currentTime} fontKey={fontKey} />;
}

export function fontKeyForView(state: DeviceUiState): string {
  if (state.page === "detail" && SETTINGS_ITEMS[state.detailIndex % SETTINGS_ITEMS.length] === "Font") {
    return state.pendingFontKey;
  }
  return state.fontKey;
}
