import {useMemo} from "react";

import type {DeviceViewModel} from "../models/view-model.js";
import {buildDeviceViewModel, type BuildDeviceViewModelInput} from "../services/view-model.js";

export function useDeviceViewModel(input: BuildDeviceViewModelInput): DeviceViewModel {
  return useMemo(
    () => buildDeviceViewModel(input),
    [input.currentTime, input.deviceId, input.progress, input.state],
  );
}
