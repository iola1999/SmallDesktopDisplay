import type {DeviceUiState} from "../ui-state.js";
import type {HomeAmbientGameViewModel} from "./models/view-model.js";
import {useDeviceViewModel} from "./hooks/useDeviceViewModel.js";
import {DetailPage} from "./pages/detail.js";
import {GameShowPage} from "./pages/game-show.js";
import {HomePage} from "./pages/home.js";
import {SettingsPage} from "./pages/settings.js";

export function DeviceView({
  currentTime,
  deviceId,
  state,
  progress,
  clockFlipProgress,
  homeGame,
}: {
  currentTime: Date;
  deviceId: string;
  state: DeviceUiState;
  progress: number;
  clockFlipProgress?: number;
  homeGame?: HomeAmbientGameViewModel;
}) {
  const model = useDeviceViewModel({currentTime, deviceId, state, progress, clockFlipProgress, homeGame});
  if (model.page === "settings") return <SettingsPage model={model} />;
  if (model.page === "detail") return <DetailPage model={model} />;
  if (model.page === "game") return <GameShowPage model={model} />;
  return <HomePage model={model} />;
}
