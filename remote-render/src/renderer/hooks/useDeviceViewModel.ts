import type {DeviceViewModel} from "../models/view-model.js";
import {buildDeviceViewModel, type BuildDeviceViewModelInput} from "../services/view-model.js";

// 每次渲染都会新建一个 reconciler container，且 input.state 是原地复用的可变对象，
// 之前的 useMemo 依赖永远命中不到缓存。直接构建视图模型即可，行为不变。
export function useDeviceViewModel(input: BuildDeviceViewModelInput): DeviceViewModel {
  return buildDeviceViewModel(input);
}
