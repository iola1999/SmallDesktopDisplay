# SmallDesktopDisplay

基于 ESP-12E 模块的桌面小屏显示器固件，使用 PlatformIO + Arduino framework。当前硬件固件仍通过 PlatformIO 的 `espressif8266` 平台和 `nodemcuv2` 板型配置构建。主功能包括时钟、天气、滚动横幅、WiFi 配网，以及可选的 DHT11 与右下角动图。

## Build

如果 `pio` 已经在 PATH 中：

```bash
pio run -e esp12e
```

如果只安装了 PlatformIO 的本地虚拟环境：

```bash
~/.platformio/penv/bin/pio run -e esp12e
```

烧录与串口监视：

```bash
~/.platformio/penv/bin/pio run -e esp12e -t upload
~/.platformio/penv/bin/pio device monitor -b 115200
```

## Architecture

- `src/app/*`: 纯 C++ 的应用核心、状态机和动作分发
- `src/ports/*`: 面向硬件/平台能力的抽象接口
- `src/adapters/*`: EEPROM、WiFi、天气、NTP、DHT11 的 ESP-12E/Arduino 适配器
- `src/ui/*`: `AppViewModel` 到 TFT 的渲染桥接
- `src/main.cpp`: 设备入口、定时驱动、按键/CLI 编排
- `src/Display.*` / `src/Screen.*`: 低层显示能力与高层页面绘制
- `src/Input.*` / `src/Cli.*`: 输入事件与串口命令解析
- `src/Animate/*`: 可选动图播放
- `test/test_native_app_core/*`: Host 侧 `AppCore` / `AppDriver` 测试

## Notes

- 编译期开关集中在 `src/AppConfig.h`
- `TFT_eSPI` 的引脚映射来自库自己的 `User_Setup.h`，不在本仓库内
- 仓库只保留当前架构，不再维护旧布局迁移或历史归档代码

## Button Controls

- 首页：短按显示调试气泡，长按进入设置；右下角动图仅在首页播放
- 菜单页：短按切到下一项，长按进入或执行当前项
- 内容页：短按向下浏览内容，长按返回上一层
- 亮度页：短按预览下一档亮度，长按保存并返回
- 后台天气刷新：静默联网，不再弹出全屏 WiFi 进度页，也不会自动抢占当前页面
