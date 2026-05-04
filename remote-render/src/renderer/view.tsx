import type {DeviceUiState} from "../ui-state.js";
import {useDeviceViewModel} from "./hooks/useDeviceViewModel.js";
import {DetailPage} from "./pages/detail.js";
import {HomePage} from "./pages/home.js";
import {SettingsPage} from "./pages/settings.js";

export function DeviceView({
  currentTime,
  deviceId,
  state,
  progress,
}: {
  currentTime: Date;
  deviceId: string;
  state: DeviceUiState;
  progress: number;
}) {
  const model = useDeviceViewModel({currentTime, deviceId, state, progress});
  if (model.page === "settings") return <SettingsPage model={model} />;
  if (model.page === "detail") return <DetailPage model={model} />;
  return <HomePage model={model} />;
}
