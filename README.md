# SmallDesktopDisplay

SmallDesktopDisplay 是一个基于 ESP-12E / ESP8266 的桌面小屏项目。当前主线已经改成远程渲染架构：设备端作为轻量网络显示客户端，负责 WiFi、按键、背光、配置持久化和 TFT 输出；Docker 服务负责生成 240x240 的实际界面帧，并维护页面状态。

现在的默认界面是一个远端渲染的中文桌面时钟，并带有基础设置页。UI 逻辑尽量放在服务端，这样后续增加界面、动画和功能时，不需要每次都重新烧写设备固件。

## 基础架构

- `src/`：ESP8266 固件，使用 PlatformIO + Arduino 构建。
- `src/main.cpp`：设备入口，负责远程帧轮询、按键上报、命令和状态同步。
- `src/remote/`：远程帧、输入事件、设备状态、远端命令相关客户端代码。
- `src/ui/`：把远端 RGB565 矩形帧输出到 TFT 的桥接层。
- `remote-render/`：Dockerized FastAPI + Pillow 渲染服务，负责生成画面、维护远端 UI 状态、接收设备输入和状态。
- `docs/`：远程渲染协议、部署说明和近期迭代记录。

## 快速开始

启动远端渲染服务：

```bash
cd remote-render
REMOTE_RENDER_PORT=18080 docker compose up -d --build
```

构建固件：

```bash
pio run -e esp12e
```

烧写并查看串口：

```bash
pio run -e esp12e -t upload
pio device monitor -b 115200
```

常用检查：

```bash
remote-render/.venv/bin/pytest -q
pio test -e host
pio run -e esp12e
```

## 配置

固件默认配置在 `src/AppConfig.h`。远端渲染地址可以在设备配网页中修改。

如果设备已经连上 WiFi，可以在同一局域网内访问设备当前获取到的 IP 地址进入配网页。如果设备还没有连上 WiFi，可以用手机或电脑连接设备发出的 `SDD-Setup` WiFi 热点，再进入配网页完成 WiFi 和远端渲染地址配置。

TFT 引脚映射来自 `TFT_eSPI` 库自己的 `User_Setup.h`，不在本仓库中维护。

## 文档

- `docs/remote-rendering-http-frame-design.md`：远程渲染架构、HTTP API、帧协议、命令/状态同步和部署说明。
- `docs/recent-iterations.md`：近期迭代记录和当前开发注意事项。
- `docs/roadmap.md`：后续功能方向和迭代优先级。
- `remote-render/tools/frame_preview.py`：本地帧预览工具，可抓取远端帧并生成 PNG。
