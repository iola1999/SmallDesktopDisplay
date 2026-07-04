# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目概要

ESP-12E 模块桌面小屏显示器，基于 PlatformIO + Arduino framework。固件当前仍通过 `espressif8266` 平台和 `nodemcuv2` 板型配置构建。当前主线是远程渲染瘦客户端：Docker 服务生成 240x240 RGB565 帧，设备负责 WiFi、按键上报、HTTP 拉取最新帧和 TFT 刷屏。入口在 [src/main.cpp](src/main.cpp)。

## 构建 / 烧录 / 串口

命令行和 VSCode PlatformIO 扩展都在使用，优先用下面两种形式：

- 构建：`~/.platformio/penv/bin/pio run -e esp12e`
- 烧录：`~/.platformio/penv/bin/pio run -e esp12e -t upload`
- 串口监视：`~/.platformio/penv/bin/pio device monitor -b 921600`

串口既是日志口也是可选的帧传输口（见 docs/remote-rendering-http-frame-design.md
的 Serial Transport 一节）：设备开机自动探测，USB 连着渲染宿主机（容器设置了
SERIAL_PORT + devices 映射）就走串口推送，否则回落 WiFi HTTP 轮询，无手动开关。
注意：串口模式下烧录前要先停容器释放端口；波特率统一 921600
（AppConfig.h kSerialBaud 与 compose 的 SERIAL_BAUD 必须一致）。

如果当前 shell 已经把 `pio` 加进 PATH，上述命令可简写成 `pio ...`。

远程渲染服务开发与验证：

- 运行测试：`cd remote-render && npm test`
- 类型检查 / 编译：`cd remote-render && npm run build`
- 本机 Docker：`cd remote-render && REMOTE_RENDER_PORT=18080 docker compose up -d --build`
- 帧预览：`cd remote-render && npm run preview -- --base-url http://127.0.0.1:18080 --device-id desk-01 --frames 2 --output frame-previews/latest.png`

**当前生产部署（2026-07-04 起）已从 Docker 容器迁移到 launchd 原生进程**：本机 Docker 是
OrbStack（Linux 虚拟机），无法把 USB 串口透传进容器，而设备现在走串口直连。服务由
`~/Library/LaunchAgents/com.sdd.remote-render.plist` 常驻（KeepAlive + RunAtLoad，等价
`restart: unless-stopped`），日志在 `~/Library/Logs/sdd-remote-render.log`。修改
`remote-render/` 后的发布方式：

```bash
cd remote-render && npm run build && launchctl kickstart -k gui/$UID/com.sdd.remote-render
```

不要再 `docker compose up`——容器已手动停止，启动会和原生进程抢 18080 端口。
烧录固件前必须先 `launchctl bootout gui/$UID/com.sdd.remote-render` 释放串口，
烧完 `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.sdd.remote-render.plist`。
compose 文件保留给 Linux 宿主机部署场景（那里 `devices:` 映射可用）。

依赖版本锁在 [platformio.ini](platformio.ini)，不要擅自升级（尤其 `espressif8266@2.6.3`）。

## 配置

[src/AppConfig.h](src/AppConfig.h) 里集中放默认远程渲染服务地址、设备 ID、按键阈值、引脚和 HTTP 超时。修改后整个项目需重新编译。

## TFT_eSPI 引脚配置

屏幕引脚**不在本仓库里**。`TFT_eSPI` 库自己的 `User_Setup.h`（位于 `.pio/libdeps/esp12e/TFT_eSPI/` 或用户全局 Arduino 库目录）决定 SCK / MOSI / DC / RES / BL。排查显示相关问题要去那里，不是在本仓库找。

## 目录说明

- [remote-render](remote-render) — Dockerized Node.js + React/Yoga/Skia 远程渲染服务
- [remote-render/src/tools/frame-preview.ts](remote-render/src/tools/frame-preview.ts) — 本地 HTTP 帧预览客户端，生成 PNG 辅助排查显示问题
- [src/main.cpp](src/main.cpp) — 设备入口、链路自动探测（串口/WiFi）、帧轮询、按键上报、命令与状态同步
- [src/remote](src/remote) — SDD1 帧协议与流式消费器、HTTP 帧拉取、串口信封协议与链路、输入/状态/命令客户端
- [src/ui/TftFrameSink.cpp](src/ui/TftFrameSink.cpp) — RGB565 矩形帧到 TFT 的输出桥接
- [src/Display.cpp](src/Display.cpp) / [src/Input.cpp](src/Input.cpp) / [src/Net.cpp](src/Net.cpp) / [src/Storage.cpp](src/Storage.cpp) — 保留的硬件基础层
- [src/app](src/app) — 纯 C++ 配置、状态文本、帧诊断、长按反馈、Keep-Alive 策略和 WiFi 配网页生成
- `test/test_native_app_core` — Host 侧基础逻辑与帧协议测试

## 代码风格

- **注释用中文**，保持与现有模块一致。
- 新增模块请放到 `src/` 下的子目录，头文件守卫用 `#ifndef MODULE_H`。
- 格式化配置在 [.clang-format](.clang-format)（LLVM 基础 + Allman 大括号 + 2 空格缩进）。手动格式化：`pio pkg exec -- clang-format -i <file>`。

## 提交规范

Conventional Commits：`feat:` / `fix:` / `chore:` / `refactor:` / `docs:`。提交信息保持简短、具体，并与实际变更范围一致。
