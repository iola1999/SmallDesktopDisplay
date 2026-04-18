# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概要

ESP8266 (NodeMCU v2 / esp12e) 桌面小屏显示器，基于 PlatformIO + Arduino framework。显示时钟、天气、动图，可选 DHT11 温湿度。绝大部分逻辑在 [src/SmallDesktopDisplay.cpp](src/SmallDesktopDisplay.cpp)（单文件 ~1400 行）。

## 构建 / 烧录 / 串口

命令行和 VSCode PlatformIO 扩展都在使用，二者等价：

- 构建：`pio run` 或 `pio run -e esp12e`
- 烧录：`pio run -t upload`
- 串口监视：`pio device monitor`（波特率 115200）

依赖版本锁在 [platformio.ini](platformio.ini)，不要擅自升级（尤其 `TJpg_Decoder@0.0.3` 和 `espressif8266@2.6.3`）。

## 编译期功能开关

[src/config.h](src/config.h) 里的宏控制功能启停，修改后整个项目需重新编译：

- `Animate_Choice` — 右下角动图：0 关闭 / 1 太空人 / 2 胡桃
- `WM_EN` — 1 启用 WiFiManager Web 配网，0 走 SmartConfig。**两者互斥**，切勿同时开启。
- `DHT_EN` — 1 启用 DHT11 温湿度传感器（GPIO12）

## TFT_eSPI 引脚配置

屏幕引脚**不在本仓库里**。`TFT_eSPI` 库自己的 `User_Setup.h`（位于 `.pio/libdeps/esp12e/TFT_eSPI/` 或用户全局 Arduino 库目录）决定 SCK / MOSI / DC / RES / BL。排查显示相关问题要去那里，不是在本仓库找。

## 目录说明

- [src/wifiReFlash/](src/wifiReFlash/) — 空占位模块（`.h` 空文件，`.cpp` 只有 include）。本来是要把 WiFi/EEPROM 抽出去，还没落地。可按需填充，不要误以为坏了。
- [test/](test/) — **不是 PlatformIO 单元测试**，是从 `.ino` 版本迁移过来的旧代码归档（旧 `.ino`、`hutao copy.h`、一堆字体副本）。后续整理 / 清理 OK，不要当成测试目标构建。

## 代码风格

- **注释用中文**，匹配 [src/SmallDesktopDisplay.cpp](src/SmallDesktopDisplay.cpp) 现有风格。
- 新增模块请放到 `src/` 下的子目录，头文件守卫用 `#ifndef MODULE_H`。
- 格式化配置在 [.clang-format](.clang-format)（LLVM 基础 + Allman 大括号 + 2 空格缩进）。手动格式化：`pio pkg exec -- clang-format -i <file>`。

## 提交规范

Conventional Commits：`feat:` / `fix:` / `chore:` / `refactor:` / `docs:`。历史仅有一条 `chore: init`，从本次开始遵守。
