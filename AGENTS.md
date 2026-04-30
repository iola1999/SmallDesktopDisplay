# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目概要

ESP-12E 模块桌面小屏显示器，基于 PlatformIO + Arduino framework。固件当前仍通过 `espressif8266` 平台和 `nodemcuv2` 板型配置构建。当前主线是远程渲染瘦客户端：Docker 服务生成 240x240 RGB565 帧，设备负责 WiFi、按键上报、HTTP 拉取最新帧和 TFT 刷屏。入口在 [src/main.cpp](src/main.cpp)。

## 构建 / 烧录 / 串口

命令行和 VSCode PlatformIO 扩展都在使用，优先用下面两种形式：

- 构建：`~/.platformio/penv/bin/pio run -e esp12e`
- 烧录：`~/.platformio/penv/bin/pio run -e esp12e -t upload`
- 串口监视：`~/.platformio/penv/bin/pio device monitor -b 115200`

如果当前 shell 已经把 `pio` 加进 PATH，上述命令可简写成 `pio ...`。

远程渲染服务开发与验证：

- 运行测试：`cd remote-render && .venv/bin/pytest`
- 本机 Docker：`cd remote-render && REMOTE_RENDER_PORT=18080 docker compose up -d --build`
- 帧预览：`cd remote-render && .venv/bin/python -m tools.frame_preview --base-url http://127.0.0.1:18080 --device-id desk-01 --frames 2 --output frame-previews/latest.png`

依赖版本锁在 [platformio.ini](platformio.ini)，不要擅自升级（尤其 `espressif8266@2.6.3`）。

## 配置

[src/AppConfig.h](src/AppConfig.h) 里集中放默认远程渲染服务地址、设备 ID、按键阈值、引脚和 HTTP 超时。修改后整个项目需重新编译。

## TFT_eSPI 引脚配置

屏幕引脚**不在本仓库里**。`TFT_eSPI` 库自己的 `User_Setup.h`（位于 `.pio/libdeps/esp12e/TFT_eSPI/` 或用户全局 Arduino 库目录）决定 SCK / MOSI / DC / RES / BL。排查显示相关问题要去那里，不是在本仓库找。

## 目录说明

- [remote-render](remote-render) — Dockerized FastAPI + Pillow 远程渲染服务
- [remote-render/tools/frame_preview.py](remote-render/tools/frame_preview.py) — 本地 HTTP 帧预览客户端，生成 PNG 辅助排查显示问题
- [src/main.cpp](src/main.cpp) — 设备入口、远程帧轮询、按键上报
- [src/remote](src/remote) — HTTP 帧协议、帧拉取、输入事件 POST
- [src/ui/TftFrameSink.cpp](src/ui/TftFrameSink.cpp) — RGB565 矩形帧到 TFT 的输出桥接
- [src/Display.cpp](src/Display.cpp) / [src/Input.cpp](src/Input.cpp) / [src/Net.cpp](src/Net.cpp) / [src/Storage.cpp](src/Storage.cpp) — 保留的硬件基础层
- [src/app](src/app) — 纯 C++ 配置、背光 PWM、WiFi 配网页生成
- `test/test_native_app_core` — Host 侧基础逻辑与帧协议测试

## 代码风格

- **注释用中文**，保持与现有模块一致。
- 新增模块请放到 `src/` 下的子目录，头文件守卫用 `#ifndef MODULE_H`。
- 格式化配置在 [.clang-format](.clang-format)（LLVM 基础 + Allman 大括号 + 2 空格缩进）。手动格式化：`pio pkg exec -- clang-format -i <file>`。

## 提交规范

Conventional Commits：`feat:` / `fix:` / `chore:` / `refactor:` / `docs:`。历史仅有一条 `chore: init`，从本次开始遵守。
