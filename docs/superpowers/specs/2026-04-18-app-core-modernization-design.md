# SmallDesktopDisplay App Core Modernization Design

## 背景

当前项目已经完成从历史单文件实现到多模块拆分的第一步，但运行时控制流仍然分散在 `main.cpp`、`Net`、`Weather`、`Screen` 和若干全局状态之间：

- `main.cpp` 直接协调启动、联网、授时、天气拉取和周期任务。
- `AppState` 同时承载持久化配置、运行时流程状态、UI 缓存和模块间共享变量。
- 多个模块直接通过 `extern g_app` 读写全局状态，边界不清晰。
- 启动和刷新逻辑依赖阻塞式流程，难以清楚表达失败路径与恢复策略。
- 核心行为依赖 Arduino/ESP8266 环境，无法在主机侧对状态机做快速验证。

这次重构的目标不是继续增加功能，而是把“系统如何运转”的知识从分散模块中收回到一个清晰、可测试、可维护的应用核心。

## 目标

1. 建立一个尽量纯 C++ 的 `AppCore`，集中管理启动流程、运行时状态机和后台同步策略。
2. 把当前混杂的全局状态拆分为配置、运行时、缓存和视图模型四类数据。
3. 用 `ports` 抽象 `AppCore` 对硬件、网络、显示和存储的依赖。
4. 把现有 `Net`、`Weather`、`Ntp`、`Storage`、`Screen`、`Display`、`Dht11` 收敛为适配器层，不再掌控应用流程。
5. 启动失败时进入明确错误页，不进入看似正常但数据不完整的主界面。
6. 进入主界面后，后台刷新失败不阻塞主循环，并保留上次成功数据。
7. 为应用状态机建立主机侧测试入口，不依赖 ESP8266 才能验证关键行为。

## 非目标

- 不在这轮替换 `WiFiManager`、`TFT_eSPI`、`HTTPClient` 等第三方库。
- 不在这轮引入重量级事件总线或复杂框架。
- 不在这轮追求 UI 视觉改版或屏幕布局大改。
- 不在这轮实现完整的硬件仿真；主机侧测试只覆盖应用核心，不覆盖真实显示、WiFi 或 HTTP 栈。

## 设计原则

- 应用流程只有一个权威来源：`AppCore`。
- 持久化配置和运行时状态严格分离。
- 显示模块只渲染 `ViewModel`，不自己拼业务逻辑。
- 网络、授时、天气、存储、传感器模块只实现能力，不定义流程。
- 所有重要失败路径都必须能被建模、测试和渲染。
- 每个阶段保持可编译，并优先保证真机固件仍然稳定。

## 总体架构

系统拆分为三层。

### 1. `app/` 应用核心

纯 C++ 层，不直接依赖 `Arduino.h`、`ESP8266WiFi.h`、`TFT_eSPI.h` 等平台库。职责：

- 维护顶层应用状态机。
- 接收外部事件。
- 产生需要执行的动作。
- 维护运行时状态、缓存和视图模型。
- 决定当前屏幕应该显示什么。

`AppCore` 是唯一允许定义“什么时候联网、什么时候授时、什么时候刷新天气、失败后怎么退回”的地方。

### 2. `ports/` 抽象接口

定义 `AppCore` 所依赖的能力边界，不暴露 ESP8266 库细节。建议的 port 包括：

- `ClockPort`
- `NetworkPort`
- `WeatherPort`
- `TimeSyncPort`
- `StoragePort`
- `DisplayPort`
- `SensorPort`

这些接口只表达能力和结构化返回值，不包含业务流程。

### 3. `adapters/` 与 `ui/` 平台实现

- `adapters/` 负责把 `ESP8266`、`HTTPClient`、`EEPROM`、`WiFiManager`、`DHT` 等具体实现包进 port 接口。
- `ui/` 负责把 `AppViewModel` 渲染到屏幕，包括主界面、错误页和启动页。

现有 `Display`、`Screen`、`weatherNum`、字体与图像资源更适合归入 `ui/`；`Net`、`Ntp`、`Weather`、`Storage`、`Dht11` 更适合收敛为 `adapters/`。

## 文件结构

建议重构后的目录如下：

```text
src/
  app/
    AppCore.h
    AppCore.cpp
    AppConfigData.h
    AppRuntimeState.h
    AppDataCache.h
    AppViewModel.h
    AppEvent.h
    AppAction.h
  ports/
    ClockPort.h
    NetworkPort.h
    WeatherPort.h
    TimeSyncPort.h
    StoragePort.h
    DisplayPort.h
    SensorPort.h
  adapters/
    ArduinoClockPort.*
    Esp8266NetworkPort.*
    HttpWeatherPort.*
    NtpTimeSyncPort.*
    EepromStoragePort.*
    Dht11SensorPort.*
  ui/
    TftDisplayPort.*
    ScreenRenderer.*
    weatherNum/*
    font/*
    img/*
  main.cpp
```

本次重构不要求一次完成所有搬迁，但最终边界应向这个结构收敛。

## 数据模型

当前 `AppState` 会拆成四类模型。

### `AppConfigData`

持久化配置，保存到 EEPROM：

- `wifi credentials`
- `cityCode`
- `weatherUpdateMinutes`
- `lcdBrightness`
- `lcdRotation`
- `dhtEnabled`

### `AppRuntimeState`

只描述应用流程状态：

- 顶层状态：`Booting` / `BlockingError` / `Operational`
- 阻断错误原因
- 首轮启动是否完成
- 当前是否正在进行后台同步
- 最近一次联网结果
- 最近一次天气刷新时间
- 最近一次授时成功时间
- 下一次计划刷新时间

### `AppDataCache`

缓存最近一次成功获取的数据：

- 最近一次成功天气数据
- 最近一次成功授时结果
- 最近一次成功 DHT11 数据

缓存属于运行期数据，不等于当前页面，也不等于持久化配置。

### `AppViewModel`

只描述“当前屏幕应该显示什么”，例如：

- 页面类型：`Splash` / `Error` / `Main`
- 主界面的时钟文本、城市、温度、湿度、AQI、天气图标、banner
- 错误页标题、详细原因、当前重试状态
- 是否显示“正在同步”

显示层只能消费 `AppViewModel`，不直接读取 `AppRuntimeState` 或网络模块内部状态。

## 顶层状态机

### 顶层状态

`AppCore` 的顶层状态机定义为：

- `Booting`
- `BlockingError`
- `Operational`

### `Booting`

设备上电后的最小初始化阶段。主要动作：

1. 读取配置
2. 初始化显示
3. 显示启动/状态页
4. 发起联网
5. 确认城市代码
6. 发起 NTP 同步
7. 拉取天气

任何首轮关键步骤失败，都不能进入主界面。

### `BlockingError`

启动或根本性问题失败时进入错误页。错误页原因至少包含：

- `NoNetwork`
- `TimeSyncFailed`
- `WeatherFetchFailed`
- `ConfigRequired`

屏幕必须明确展示失败阶段、失败原因、是否在重试。

### `Operational`

只有首轮联网、授时和天气初始化全部完成后才能进入。进入后：

- 主界面持续可用
- 时钟持续更新
- 后台周期性刷新天气和时间
- 刷新失败时保留上次成功数据
- 后台失败不再阻断主循环

## 运行期策略

### 启动期规则

- 启动后立即显示启动页或状态页。
- 只有当首轮 `联网 + 城市代码确认 + NTP + 天气` 全部成功，才切到主界面。
- 任一关键步骤失败，进入 `BlockingError` 并显示对应错误页。

### 运行期规则

- 进入 `Operational` 后，时钟和主界面一直可显示。
- 到刷新周期时，`AppCore` 发起后台同步动作：
  1. 唤醒 WiFi
  2. 确保联网
  3. 同步 NTP
  4. 刷新天气
  5. 更新缓存
  6. 关闭 WiFi
- 如果后台同步失败：
  - 主界面保持上次成功数据
  - 记录失败原因与时间
  - 在下个周期继续重试
- 只有用户主动重置 WiFi、配置无效、或需要重新配网时，才重新进入阻断错误页。

## 事件与动作模型

`AppCore` 内部采用“事件输入 + 动作输出”模式，但这个模式只用于核心层，不扩张成全项目消息总线。

### 典型事件

- `BootRequested`
- `ConfigLoaded`
- `ConfigLoadFailed`
- `Tick1s`
- `RefreshDue`
- `WifiConnected`
- `WifiConnectionFailed`
- `CityCodeResolved`
- `CityCodeResolveFailed`
- `TimeSynced`
- `TimeSyncFailed`
- `WeatherFetched`
- `WeatherFetchFailed`
- `ButtonShortPressed`
- `ButtonLongPressed`
- `SerialCommandReceived`

### 典型动作

- `RenderSplash`
- `RenderBlockingError`
- `RenderMain`
- `ConnectWifi`
- `ResolveCityCode`
- `SyncTime`
- `FetchWeather`
- `PersistConfig`
- `SleepWifi`
- `WakeWifi`
- `ResetWifiAndRestart`

`main.cpp` 的职责将收敛为：

1. 从 adapters 收集输入事件
2. 把事件送给 `AppCore`
3. 执行 `AppCore` 输出的动作
4. 根据新的 `AppViewModel` 触发渲染

## Port 边界

### `StoragePort`

- 读取/写入 `AppConfigData`
- 不负责 UI 或流程决策

### `NetworkPort`

- 建立连接、检测连接状态、断开、重置配网
- 返回结构化结果，不修改应用全局状态

### `WeatherPort`

- 输入城市代码
- 输出结构化天气结果或失败原因
- 不直接改 `banner`、不直接画屏

### `TimeSyncPort`

- 发起一次时间同步
- 返回结果和时间戳

### `DisplayPort`

- 渲染启动页、错误页、主界面
- 只接受 `AppViewModel` 或明确页面命令
- 不读取网络状态或 EEPROM

### `SensorPort`

- 读取 DHT11 结果
- 返回结构化传感器值或失败结果

## UI 行为

### 启动页

用于 `Booting` 阶段，展示：

- 当前阶段，例如“连接网络”“同步时间”“获取天气”
- 进行中的状态
- 必要时的简单进度提示

### 错误页

用于 `BlockingError` 阶段，展示：

- 清晰标题
- 错误原因
- 当前动作，例如“正在重试”或“等待用户处理”

### 主界面

进入 `Operational` 后使用，展示：

- 实时时钟
- 城市与天气
- 温湿度、AQI 和天气图标
- 滚动 banner
- 可选 DHT11 信息
- 可选同步状态提示

## `main.cpp` 重构目标

最终 `main.cpp` 只保留装配和驱动逻辑：

1. 构造具体 adapters
2. 构造 `AppCore`
3. 完成初始化
4. 在循环中喂入周期事件和外部事件
5. 执行动作
6. 驱动一次渲染

它不再直接编排启动顺序、网络恢复和天气刷新细节。

## 实施分期

### Phase 1: 建立应用核心骨架

- 新增 `app/` 与 `ports/`
- 定义 `AppCore`、事件、动作和核心状态模型
- 先接管顶层状态与错误页决策

### Phase 2: 接管启动流程

- 把 `setup()` 中的配置读取、联网、授时、天气首拉迁入 `AppCore`
- 完成 `Booting -> BlockingError / Operational` 的闭环

### Phase 3: 接管运行期刷新

- 把周期调度改成显式事件与后台同步动作
- 替代当前隐式的副作用调度方式

### Phase 4: 清理剩余耦合

- 移除剩余 `g_app` 直写
- 逐步把模块改为 port/adapters 风格
- 补齐核心状态机测试

## 测试策略

### 主机侧测试

为 `AppCore` 提供纯 C++ 测试，重点覆盖：

- 启动状态机是否按预期跳转
- 首轮联网/授时/天气失败时是否进入正确错误页
- 进入 `Operational` 后后台失败是否保留主界面
- 配置变更后是否产出正确动作
- 定时刷新是否按计划触发

主机侧测试应尽量避免依赖 Arduino 环境，优先验证状态和动作序列。

### 固件侧验证

继续使用：

```bash
~/.platformio/penv/bin/pio run -e esp12e
```

重点验证：

- 固件可编译
- adapters 能与 ESP8266/TFT/WiFiManager/HTTPClient 正常协作
- 真机行为符合新的启动与运行时语义

## 风险与取舍

- 这次重构优先整理控制流，不追求一次纯化所有模块。
- 第三方库先包进 adapter，不在本轮替换。
- 如果某模块完整 port 化成本过高，允许先加 façade 过渡。
- 每一阶段都必须保持 `pio run -e esp12e` 可通过，避免把“设计完成”建立在不可编译中间态上。

## 完成标准

达到以下条件时，可认为这轮重构完成：

1. `main.cpp` 只剩装配与循环驱动，不再持有业务流程。
2. 不再有跨模块随意写入的全局应用状态。
3. 启动流程由 `AppCore` 统一控制，失败进入阻断错误页。
4. 进入主界面后，后台同步失败不会阻塞主循环。
5. 至少有一组主机侧测试覆盖启动状态机和后台刷新状态机。
6. 固件仍能通过 `~/.platformio/penv/bin/pio run -e esp12e`。
