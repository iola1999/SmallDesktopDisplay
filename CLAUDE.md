# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概要

ESP-12E 模块桌面小屏显示器，基于 PlatformIO + Arduino framework。固件当前仍通过 `espressif8266` 平台和 `nodemcuv2` 板型配置构建。显示时钟、天气、滚动横幅、动图，可选 DHT11 温湿度。入口在 [src/main.cpp](src/main.cpp)。

## 构建 / 烧录 / 串口

命令行和 VSCode PlatformIO 扩展都在使用，优先用下面两种形式：

- 构建：`~/.platformio/penv/bin/pio run -e esp12e`
- 烧录：`~/.platformio/penv/bin/pio run -e esp12e -t upload`
- 串口监视：`~/.platformio/penv/bin/pio device monitor -b 115200`

如果当前 shell 已经把 `pio` 加进 PATH，上述命令可简写成 `pio ...`。

依赖版本锁在 [platformio.ini](platformio.ini)，不要擅自升级（尤其 `TJpg_Decoder@0.0.3` 和 `espressif8266@2.6.3`）。

## 编译期功能开关

[src/AppConfig.h](src/AppConfig.h) 里的宏控制功能启停，修改后整个项目需重新编译：

- `ANIMATE_CHOICE` — 右下角动图：0 关闭 / 1 太空人 / 2 胡桃
- `WM_EN` — 1 启用 WiFiManager Web 配网，0 走 SmartConfig。**两者互斥**，切勿同时开启。
- `DHT_EN` — 1 启用 DHT11 温湿度传感器（GPIO12）

## TFT_eSPI 引脚配置

屏幕引脚**不在本仓库里**。`TFT_eSPI` 库自己的 `User_Setup.h`（位于 `.pio/libdeps/esp12e/TFT_eSPI/` 或用户全局 Arduino 库目录）决定 SCK / MOSI / DC / RES / BL。排查显示相关问题要去那里，不是在本仓库找。

## 目录说明

- [src/main.cpp](src/main.cpp) — 设备入口、定时调度、输入/CLI 编排
- [src/app](src/app) — 纯 C++ 应用核心、状态机、动作驱动
- [src/ports](src/ports) — 抽象能力边界
- [src/adapters](src/adapters) — EEPROM、WiFi、天气、NTP、DHT11 的硬件适配器
- [src/ui](src/ui) — `AppViewModel` 到 TFT 的 UI 桥接
- [src/Display.cpp](src/Display.cpp) / [src/Screen.cpp](src/Screen.cpp) — 底层显示封装与高层页面绘制
- [src/Input.cpp](src/Input.cpp) / [src/Cli.cpp](src/Cli.cpp) — 按键事件与串口命令解析
- [src/Dht11.cpp](src/Dht11.cpp) / [src/Animate/Animate.cpp](src/Animate/Animate.cpp) — 可选传感器与动图模块
- `test/test_native_app_core` — Host 侧 `AppCore` / `AppDriver` 测试

## 代码风格

- **注释用中文**，保持与现有模块一致。
- 新增模块请放到 `src/` 下的子目录，头文件守卫用 `#ifndef MODULE_H`。
- 格式化配置在 [.clang-format](.clang-format)（LLVM 基础 + Allman 大括号 + 2 空格缩进）。手动格式化：`pio pkg exec -- clang-format -i <file>`。

## 提交规范

Conventional Commits：`feat:` / `fix:` / `chore:` / `refactor:` / `docs:`。历史仅有一条 `chore: init`，从本次开始遵守。
