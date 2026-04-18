# SmallDesktopDisplay

基于 ESP8266 (`nodemcuv2` / `esp12e`) 的桌面小屏显示器固件，使用 PlatformIO + Arduino framework。当前代码已经从历史单文件实现拆分为独立模块，主功能包括时钟、天气、滚动横幅、WiFi 配网，以及可选的 DHT11 与右下角动图。

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

- `src/main.cpp`: 启动入口与周期任务调度
- `src/Display.*`: TFT 初始化、背光、基础绘图
- `src/Screen.*`: 时钟、天气主界面、横幅等高层 UI
- `src/Net.*`: WiFi 连接、WiFiManager 配网、在线刷新生命周期
- `src/Ntp.*`: NTP 同步
- `src/Weather.*`: 天气接口拉取与解析
- `src/Storage.*`: EEPROM 持久化
- `src/Input.*`: 按键交互
- `src/Cli.*`: 串口配置命令
- `src/Dht11.*`: 可选 DHT11 读取
- `src/Animate/*`: 可选动图播放

## Notes

- 编译期开关集中在 `src/AppConfig.h`
- `TFT_eSPI` 的引脚映射来自库自己的 `User_Setup.h`，不在本仓库内
- 仓库只保留当前架构，不再维护旧布局迁移或历史归档代码
