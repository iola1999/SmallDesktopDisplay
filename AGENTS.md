# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目概要

ESP-12E 模块桌面小屏显示器，基于 PlatformIO + Arduino framework。固件当前仍通过 `espressif8266` 平台和 `nodemcuv2` 板型配置构建。当前主线是远程渲染瘦客户端：Mac 上常驻的 Node.js 服务生成 240x240 RGB565 帧，设备负责连接、按键上报、帧接收和 TFT 刷屏。入口在 [src/main.cpp](src/main.cpp)。

## 构建 / 烧录 / 串口

命令行和 VSCode PlatformIO 扩展都在使用，优先用下面两种形式：

- 构建：`~/.platformio/penv/bin/pio run -e esp12e`
- 烧录：`~/.platformio/penv/bin/pio run -e esp12e -t upload`
- 串口监视：`~/.platformio/penv/bin/pio device monitor -b 921600`

串口既是日志口也是可选的帧传输口（见 docs/remote-rendering-http-frame-design.md
的 Serial Transport 一节）：设备开机自动探测，USB 连着渲染宿主机且服务配置了
`SERIAL_PORT` 时走串口推送，否则回落 WiFi HTTP 轮询，无手动开关。
串口模式下烧录前要先停止占用端口的渲染服务；波特率统一为 921600
（`AppConfig.h` 的 `kSerialBaud` 与服务端 `SERIAL_BAUD` 必须一致）。

如果当前 shell 已经把 `pio` 加进 PATH，上述命令可简写成 `pio ...`。

远程渲染服务开发与验证：

- 运行测试：`cd remote-render && npm test`
- 类型检查 / 编译：`cd remote-render && npm run build`
- Linux / Docker：`cd remote-render && REMOTE_RENDER_PORT=18080 docker compose up -d --build`
- 帧预览：`cd remote-render && npm run preview -- --base-url http://127.0.0.1:18080 --device-id desk-01 --frames 2 --output frame-previews/latest.png`

**当前生产部署（2026-07-04 起）已从 Docker 容器迁移到 launchd 原生进程**：本机 Docker 是
OrbStack（Linux 虚拟机），无法把 USB 串口透传进容器，而设备现在走串口直连。服务由
`~/Library/LaunchAgents/com.sdd.remote-render.plist` 常驻（KeepAlive + RunAtLoad，等价
`restart: unless-stopped`），日志在 `~/Library/Logs/sdd-remote-render.log`。修改
`remote-render/` 后的发布方式：

```bash
cd remote-render && npm run build && launchctl kickstart -k gui/$UID/com.sdd.remote-render
```

当前 Mac 不要运行 `docker compose up`。容器已手动停止，再次启动会和原生进程争用 18080 端口。
烧录固件前必须先 `launchctl bootout gui/$UID/com.sdd.remote-render` 释放串口，
烧完 `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.sdd.remote-render.plist`。
compose 文件保留给 Linux 宿主机部署场景（那里 `devices:` 映射可用）。

依赖版本锁在 [platformio.ini](platformio.ini)，不要擅自升级（尤其 `espressif8266@2.6.3`）。

## 配置

[src/AppConfig.h](src/AppConfig.h) 里集中放默认远程渲染服务地址、设备 ID、按键阈值、引脚和 HTTP 超时。修改后整个项目需重新编译。

## TFT_eSPI 引脚配置

屏幕引脚由 `TFT_eSPI` 库自己的 `User_Setup.h` 决定。该文件位于 `.pio/libdeps/esp12e/TFT_eSPI/` 或用户全局 Arduino 库目录，配置 SCK / MOSI / DC / RES / BL。排查显示相关问题时直接检查该文件。

## 目录说明

- [remote-render](remote-render)：Node.js + React/Yoga/Skia 远程渲染服务
- [remote-render/src/tools/frame-preview.ts](remote-render/src/tools/frame-preview.ts)：本地 HTTP 帧预览客户端，生成 PNG 辅助排查显示问题
- [.agents/notes](.agents/notes)：提案、决策、实施记录和轮次状态
- [src/main.cpp](src/main.cpp)：设备入口、链路自动探测（串口/WiFi）、帧轮询、按键上报、命令与状态同步
- [src/remote](src/remote)：SDD1 帧协议与流式消费器、HTTP 帧拉取、串口信封协议与链路、输入/状态/命令客户端
- [src/ui/TftFrameSink.cpp](src/ui/TftFrameSink.cpp)：RGB565 矩形帧到 TFT 的输出桥接
- [src/Display.cpp](src/Display.cpp) / [src/Input.cpp](src/Input.cpp) / [src/Net.cpp](src/Net.cpp) / [src/Storage.cpp](src/Storage.cpp)：保留的硬件基础层
- [src/app](src/app)：纯 C++ 配置、状态文本、帧诊断、长按反馈、Keep-Alive 策略和 WiFi 配网页生成
- `test/test_native_app_core`：Host 侧基础逻辑与帧协议测试

## 改动记录

修改前先阅读 [.agents/notes/README.md](.agents/notes/README.md) 与[轮次工作记录](.agents/notes/implemented/process/2026-08-23-轮次工作记录.md)。

- 非平凡变更必须在同一次提交中新增或更新至少一条 `.agents/notes/` 记录。判断标准、目录分类和固定章节以说明文件为准。
- 所有进入实施讨论的非平凡提案在实施前写入 `proposed/`。交付后移动到 `implemented/` 并同步实际行为；否决后移动到 `rejected/` 或删除。
- 轮次工作记录只保存目标、完成状态、验证结果和详细记录链接，完成一项就更新一次。
- 规格文档描述当前系统；决策记录说明原因、替代方案和影响。修改协议、部署、配置或页面行为时同步更新两类文档。
- 实施中出现实质偏离时采用保守方案，在轮次工作记录中增加 `Deviations`，结束时统一说明。

## 代码风格

- **注释用中文**，保持与现有模块一致。
- 新增或大幅修改中文文档、需求说明和 PR 文本时，使用 `humanizer-zh` 技能检查措辞，删除套话、模糊归因和重复总结。
- 新增模块请放到 `src/` 下的子目录，头文件守卫用 `#ifndef MODULE_H`。
- 格式化配置在 [.clang-format](.clang-format)（LLVM 基础 + Allman 大括号 + 2 空格缩进）。手动格式化：`pio pkg exec -- clang-format -i <file>`。

## 提交规范

Conventional Commits：`feat:` / `fix:` / `chore:` / `refactor:` / `docs:`。提交信息保持简短、具体，并与实际变更范围一致。
