# SmallDesktopDisplay 单按钮设置与页面导航设计

## 背景

当前固件已经具备以下基础能力：

- `Input` 已能区分 `ShortPress` 与 `LongPress`
- `AppCore` 已负责启动流程、阻断错误与后台同步状态机
- `AppDriver` 已能执行纯核心产出的动作，并调用平台 `ports`
- `Screen`/`ui` 已具备从 `AppViewModel` 渲染页面的能力

但当前按钮行为仍是临时实现：

- 首页短按直接 `ESP.reset()`
- 首页长按直接清 WiFi 并重启

这不适合作为最终交互。按钮交互需要进入统一、可扩展、可测试的导航框架，为后续继续添加设置项提供稳定基础。

## 目标

1. 把单按钮交互收敛为统一导航框架，不再在 `main.cpp` 里散写页面逻辑。
2. 首页短按只显示调试提示气泡，不触发重启。
3. 首页长按进入设置菜单。
4. 设置菜单支持：
   - `运行状态检查`
   - `亮度设置`
   - `触发重启`
5. 菜单页、内容页、调节页共用统一的页面外壳与底部操作提示。
6. 危险动作采用确认页，不允许第一下长按就直接重启。
7. 运行状态检查页面在进入时抓一次快照，停留期间不自动刷新。
8. 保持后续可扩展性，便于继续加入 WiFi 重置、刷新周期、方向设置等选项。

## 非目标

- 这次不实现多按钮或触摸滑动等更复杂输入模式。
- 这次不做完整设置系统持久化框架，除亮度外不新增其他可写配置。
- 这次不实现图形化动画菜单、图标网格、复杂转场。
- 这次不引入新的第三方 UI 框架。

## 设计原则

- 按钮语义全局统一，用户无需为每个页面重新学习操作。
- 页面框架统一渲染标题、内容区、底部提示和气泡消息。
- 系统运行状态机与导航状态机分层，互不污染。
- 页面内容尽量结构化建模，避免渲染层自己拼业务逻辑。
- 所有导航规则都应能在 host 侧测试。

## 交互规则

### 顶层规则

- 首页：
  - 短按：显示调试提示气泡消息
  - 长按：进入设置菜单
- 菜单页：
  - 第一个选项固定是“返回”
  - 短按：选中下一项，循环滚动
  - 长按：执行当前项
- 内容页：
  - 短按：返回上一层
  - 长按：返回上一层
- 调节页：
  - 短按：切换当前调节值
  - 长按：确认保存并返回

### 危险动作规则

- `触发重启` 不直接重启
- 在设置菜单中长按 `触发重启` 后，进入 `重启确认菜单`
- `重启确认菜单` 仍然是菜单页：
  - 第一个选项固定是 `返回`
  - 另一个选项是 `确认重启`

## 页面结构

建议在 `Operational` 模式下新增一套独立的导航状态。

### 页面类型

- `Home`
- `SettingsMenu`
- `DiagnosticsPage`
- `BrightnessAdjustPage`
- `RebootConfirmMenu`

### 页面种类

为避免每个页面单独发明渲染和提示逻辑，页面内容抽象为三类：

- `MenuPage`
- `InfoPage`
- `AdjustPage`

这三类页面共享统一 `PageChrome`。

## 页面外壳

### `PageChrome`

统一页面框架包含：

- `title`
- `subtitle`
- `footerHints`
- `toast`

### `FooterHints`

底部提示使用结构化字段，而不是每页手写自由文本：

- `shortPressLabel`
- `longPressLabel`

对应规则：

- 菜单页：`短按:下一项` / `长按:进入`
- 内容页：`短按:返回` / `长按:返回`
- 亮度页：`短按:切换亮度` / `长按:保存返回`

### `ToastState`

用于首页短按时显示调试提示消息：

- 只在首页使用
- 自动消失
- 不改变当前页面层级

## 页面内容

### 1. 设置菜单

顶层设置菜单先只包含 4 项：

1. `返回`
2. `运行状态检查`
3. `亮度设置`
4. `触发重启`

后续添加新项时，继续沿用相同菜单结构。

### 2. 运行状态检查

这是内容页，不是菜单页。

进入该页时抓取一次快照，停留期间不自动更新。展示信息：

- `free heap`
- `program flash used`
- `program flash total`
- 当前连接的 `WiFi SSID`

若未连接 WiFi，则显示 `not connected`。

该页中：

- 短按返回设置菜单
- 长按返回设置菜单

### 3. 亮度设置

这是调节页。

进入该页时读取当前亮度作为临时编辑值，短按只改临时值并实时预览，长按才保存。

亮度档位固定为：

- `10`
- `25`
- `40`
- `55`
- `70`
- `85`
- `100`

规则：

- 进入时定位到最接近当前亮度的档位
- 短按：切到下一个档位并立即预览亮度变化
- 长按：保存到配置并返回设置菜单
- 如果用户未长按确认就离开，不写入 EEPROM

### 4. 重启确认

这是菜单页，先只包含：

1. `返回`
2. `确认重启`

长按 `确认重启` 后才执行真正重启。

## 数据模型

建议在 `app/` 中新增以下模型。

### `UiRoute`

表示当前停留的页面：

- `Home`
- `SettingsMenu`
- `DiagnosticsPage`
- `BrightnessAdjustPage`
- `RebootConfirmMenu`

### `UiPageKind`

表示页面种类：

- `Menu`
- `Info`
- `Adjust`

### `SettingsMenuItem`

表示当前菜单可选项：

- `Back`
- `Diagnostics`
- `Brightness`
- `Reboot`
- `ConfirmReboot`

其中 `ConfirmReboot` 仅在确认菜单使用。

### `UiSessionState`

建议包含：

- `route`
- `selectedMenuIndex`
- `selectedBrightnessPresetIndex`
- `toastVisible`
- `toastDeadlineEpoch`
- `diagnosticsSnapshotValid`

### `DiagnosticsSnapshot`

建议包含：

- `freeHeapBytes`
- `programFlashUsedBytes`
- `programFlashTotalBytes`
- `wifiSsid`
- `wifiConnected`

## 事件与动作扩展

### 新事件

在 `AppEvent` 中增加：

- `shortPressed`
- `longPressed`
- `toastExpired`
- `diagnosticsSnapshotCaptured`

### 新动作

在 `AppAction` 中增加：

- `CaptureDiagnosticsSnapshot`
- `PreviewBrightness`
- `ApplyBrightness`

说明：

- `PreviewBrightness` 只做实时预览，不持久化
- `ApplyBrightness` 负责持久化并应用

## Port 扩展

为避免 `AppCore` 直接依赖 Arduino/ESP API，新增 `SystemStatusPort`。

### `SystemStatusPort`

用于一次性抓取运行状态：

- `freeHeapBytes`
- `programFlashUsedBytes`
- `programFlashTotalBytes`
- `wifiSsid`
- `wifiConnected`

`AppDriver` 在收到 `CaptureDiagnosticsSnapshot` 动作后，通过该 port 获取一次快照，再把结果作为事件送回 `AppCore`。

这保证：

- `AppCore` 仍然保持纯 C++
- 平台相关细节只留在 `ports/adapters`

## 运行时分层

### `AppCore`

负责：

- 解释按钮事件
- 管理页面跳转
- 管理 toast 生命周期
- 管理亮度调节临时值与提交时机
- 决定何时请求诊断快照
- 生成统一 `AppViewModel`

### `AppDriver`

负责：

- 执行动作
- 抓取系统状态快照
- 预览亮度
- 持久化亮度
- 对危险动作调用平台重启能力

### `Screen` / `ui`

负责：

- 绘制统一页面外壳
- 根据 `MenuBody / InfoBody / AdjustBody` 绘制内容区
- 绘制底部操作提示
- 绘制首页 toast

## UI 渲染建议

### 统一页面骨架

所有设置相关页面统一分为三块：

1. 顶部标题区
2. 中部内容区
3. 底部操作提示区

这样后续新增页面时，只需要补内容区渲染，不需要重复画标题和底部说明。

### 设置菜单

- 高亮当前选项
- 保持简单、稳定、可读
- 若未来菜单项变多，可复用同一菜单 body 逻辑

### 诊断页

- 以 2 列或分组文本方式展示
- 优先可读性，不追求复杂图形
- 页面底部保留统一返回提示

### 亮度页

- 中间显示大号百分比
- 配合进度条或档位条
- 预览应即时生效

### 首页 toast

- 位置固定，避免遮挡核心天气与时钟区域
- 作为轻量 overlay 绘制
- 自动消失后恢复首页正常状态

## 测试策略

host 侧至少新增以下测试：

1. 首页短按只显示 toast，不离开首页
2. 首页长按进入设置菜单
3. 菜单页短按在选项间循环
4. `运行状态检查` 进入时触发一次快照动作
5. `运行状态检查` 页面内短按和长按都返回
6. 亮度页短按只改变临时亮度并触发预览动作
7. 亮度页长按才触发保存动作
8. `触发重启` 先进入确认菜单，不直接重启
9. 只有在确认菜单中长按 `确认重启` 才触发重启动作

## 实现边界建议

本次只实现：

- 单按钮导航框架
- 首页调试提示气泡
- 顶层设置菜单
- 运行状态检查页面
- 亮度设置页面
- 重启确认菜单
- 统一页面外壳和底部操作提示

本次不实现但应保留扩展位：

- WiFi 重置
- 天气刷新周期设置
- 屏幕方向设置
- DHT 开关
- 固件版本/构建信息
- 网络诊断

## 风险与约束

- 亮度预览是即时生效的，必须保证“未确认不落盘”的语义清晰。
- 诊断页的 flash 数据应来自真实可用接口，不能伪造不存在的文件系统占用。
- `AppCore` 不应直接引用 `ESP.getFreeHeap()` 或 `WiFi.SSID()` 等平台 API。
- 设置导航不应打断现有后台同步主流程；它只改变页面与交互，不改变系统生命周期模型。

## 结论

推荐实现方案是在现有 `AppCore` 架构上增加一套独立的、可测试的 UI 导航子状态机，并通过统一页面框架承载菜单页、内容页与调节页。这样可以在不破坏现有启动/同步架构的前提下，把单按钮交互提升为后续可持续扩展的设置系统基础。
