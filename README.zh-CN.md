# SmallDesktopDisplay

[English](README.md)

SmallDesktopDisplay 是一个基于 ESP-12E / ESP8266 的桌面小屏项目。当前主线已经改成远程渲染架构：设备端作为轻量显示客户端，负责 WiFi、按键、背光、配置持久化和 TFT 输出；Node.js 服务负责生成 240x240 的实际界面帧，并维护页面状态。设备连接 Mac 时优先使用串口，串口不可用时回落到 WiFi HTTP。

现在的默认界面是一个远端渲染的中文桌面时钟，并带有亮度、字体、设备诊断和渲染状态等基础设置。UI 逻辑尽量放在服务端，这样后续增加界面、动画和功能时，不需要每次都重新烧写设备固件。

## 基础架构

- `src/`：ESP8266 固件，使用 PlatformIO + Arduino 构建。
- `src/main.cpp`：设备入口，负责远程帧轮询、按键上报、命令和状态同步。
- `src/remote/`：远程帧、输入事件、设备状态、远端命令相关客户端代码。
- `src/ui/`：把远端 RGB565 矩形帧输出到 TFT 的桥接层。
- `remote-render/`：Node.js + React/Yoga/Skia 渲染服务，负责生成画面、维护远端 UI 状态、接收设备输入和状态。
- `docs/`：远程渲染协议、部署说明和近期迭代记录。
- `.agents/notes/`：提案、决策、实施记录和轮次状态。

## 快速开始

Linux 主机可以通过 Docker 启动远端渲染服务：

```bash
cd remote-render
REMOTE_RENDER_PORT=18080 docker compose up -d --build
```

本仓库当前使用的 Mac 实例由 launchd 托管。修改 `remote-render/` 后执行：

```bash
cd remote-render && npm run build
launchctl kickstart -k gui/$UID/com.sdd.remote-render
```

构建固件：

```bash
pio run -e esp12e
```

当前 Mac 使用串口传帧，烧写前先停止 launchd 服务，烧写后再恢复：

```bash
launchctl bootout gui/$UID/com.sdd.remote-render
pio run -e esp12e -t upload
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.sdd.remote-render.plist
```

需要直接查看串口日志时，也要让服务释放端口。退出监视后恢复服务：

```bash
launchctl bootout gui/$UID/com.sdd.remote-render
pio device monitor -b 921600
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.sdd.remote-render.plist
```

常用检查：

```bash
cd remote-render && npm test
pio test -e host
pio run -e esp12e
```

## 配置

固件默认配置在 `src/AppConfig.h`。远端渲染地址可以在设备配网页中修改。

如果设备已经连上 WiFi，可以在同一局域网内访问设备当前获取到的 IP 地址进入配网页。如果设备还没有连上 WiFi，可以用手机或电脑连接设备发出的 `SDD-Setup` WiFi 热点，再进入配网页完成 WiFi 和远端渲染地址配置。

TFT 引脚映射来自 `TFT_eSPI` 库自己的 `User_Setup.h`，不在本仓库中维护。

## 文档

- `.agents/notes/README.md`：非平凡改动、提案和实施记录的格式与生命周期。
- `.agents/notes/proposed/feature/2026-08-23-桌面内容页面与同步歌词.md`：同步歌词、状态页面和内容想法。
- `.agents/notes/proposed/architecture/2026-08-23-Web控制台与配置模型.md`：控制台、首页布局、页面列表和配置模型提案。
- `docs/remote-rendering-http-frame-design.md`：远程渲染架构、HTTP API、帧协议、命令/状态同步和部署说明。
- `docs/recent-iterations.md`：改动记录机制建立前的近期迭代历史。
- `docs/roadmap.md`：后续功能方向和迭代优先级。
- `remote-render/src/tools/frame-preview.ts`：本地帧预览工具，可抓取远端帧并生成 PNG。
