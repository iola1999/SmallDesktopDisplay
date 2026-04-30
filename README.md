# SmallDesktopDisplay

基于 ESP-12E 模块的桌面小屏显示器固件，使用 PlatformIO + Arduino framework。当前硬件固件仍通过 PlatformIO 的 `espressif8266` 平台和 `nodemcuv2` 板型配置构建。

当前主线已切换为远程渲染瘦客户端：Docker 服务负责生成 240x240 RGB565 帧，设备只负责 WiFi、按键上报、HTTP 拉取最新帧和 TFT 刷屏。旧天气、NTP、设置页动效和本地复杂 UI 代码已删除。

## Build

固件构建、烧写仍然走 PlatformIO 的 `esp12e` 环境；远程渲染服务走
`remote-render/` 下的 Docker Compose。日常开发时建议先启动 Docker 服务，
再烧写/重启设备。

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

- `remote-render/*`: Dockerized FastAPI + Pillow 渲染服务
- `remote-render/app/ui_state.py`: 远程页面状态机与单按钮导航语义
- `src/remote/*`: HTTP 帧协议、帧拉取、按键事件上报
- `src/ui/TftFrameSink.*`: RGB565 矩形帧到 TFT 的输出桥接，当前按 4 行一批推送
- `src/main.cpp`: 设备入口、远程帧轮询、按键上报
- `src/Display.*` / `src/Input.*` / `src/Net.*` / `src/Storage.*`: 保留的硬件基础层
- `src/app/*`: 保留纯 C++ 配置、背光 PWM、WiFi 配网页生成
- `test/test_native_app_core/*`: Host 侧基础逻辑与帧协议测试

## Notes

- 编译期开关集中在 `src/AppConfig.h`
- `TFT_eSPI` 的引脚映射来自库自己的 `User_Setup.h`，不在本仓库内
- 远程帧协议设计见 `docs/remote-rendering-http-frame-design.md`
- 第一版远程服务 URL 只支持 `http://`

## Remote Renderer

本机 Docker 启动：

```bash
cd remote-render
docker compose up --build
```

默认监听 `http://0.0.0.0:8080`。设备配网页中填写 Mac 的局域网地址，例如 `http://192.168.1.20:8080`。
如果 8080 已被占用，可用 `REMOTE_RENDER_PORT=18080 docker compose up --build`，设备里对应填写 `http://<Mac局域网IP>:18080`。
当前开发机默认配置使用 `http://192.168.1.7:18080`。

服务端第一帧或重同步帧是 240x240 全屏 RGB565，约 115KB。正常时钟刷新和页面变化都走 dirty rect；大面积页面变化会拆成 `240x8` 小条并交错发送，避免设备端出现单个大矩形从上扫到底的观感。服务端会在这些场景强制返回全屏帧：

- 设备传 `have=0`，表示冷启动或本地没有可用基准帧
- 设备传来的 `have` 比服务端当前 frame id 还大，通常表示 Docker 服务刚重启
- 后续 dirty rect 过大或需要重新建立画面基准时

### Local Preview Client

为了不用反复拍照排查显示问题，仓库提供了本地帧预览客户端。它会请求远端 HTTP 帧，按 `SDD1` 协议合成 PNG：

```bash
cd remote-render
.venv/bin/python -m tools.frame_preview \
  --base-url http://127.0.0.1:18080 \
  --device-id preview-01 \
  --frames 2 \
  --output frame-previews/latest.png
```

输出目录 `remote-render/frame-previews/` 已加入 `.gitignore`。命令输出会标明每帧是 `full` 还是 `partial`，以及矩形范围，便于确认是否发生了错误的局部刷新。
本地预览建议使用 `preview-01` 这类独立设备 ID，不要和实机默认的 `desk-01` 共用同一个远程状态。

也可以先向远端服务发送一次按键事件再抓帧，例如长按进入设置页并捕获 8 帧动画：

```bash
cd remote-render
.venv/bin/python -m tools.frame_preview \
  --base-url http://127.0.0.1:18080 \
  --device-id preview-01 \
  --input-event long_press \
  --input-seq 1 \
  --frames 8 \
  --wait-ms 60 \
  --output frame-previews/settings.png
```

### Remote Renderer Development

Python 依赖建议装在 `remote-render/.venv`，该目录也已忽略：

```bash
cd remote-render
python3 -m venv .venv
.venv/bin/pip install -e '.[test]'
.venv/bin/pytest
```

Docker 镜像基于 `python:3.12-slim`，额外安装 `fonts-dejavu-core`，否则 Pillow 会退回默认小位图字体，导致设备端文字明显过小。
Dockerfile 已把第三方依赖安装和 `app/` 代码复制拆开，并使用 BuildKit pip cache；日常只改远程渲染代码时，重建通常只会重装本地包，不会重新下载 Pillow/FastAPI。

本机 `clang-format` 由 Homebrew LLVM 提供，并通过 `~/.platformio/packages/tool-clangformat` 的本地 shim 暴露给 PlatformIO；因此下面这个命令可直接使用：

```bash
~/.platformio/penv/bin/pio pkg exec -- clang-format -i src/remote/HttpFrameClient.cpp
```

### Firmware Development Checks

改动固件侧帧协议、TFT 输出、配置页或主循环后至少跑：

```bash
~/.platformio/penv/bin/pio test -e host
~/.platformio/penv/bin/pio run -e esp12e
```

需要实机验证时再烧写：

```bash
~/.platformio/penv/bin/pio run -e esp12e -t upload
```

## Button Controls

- 短按、双击、长按由设备识别后 POST 给远程渲染服务
- 设备本地不再解释页面业务逻辑
- 当前远程语义：长按从首页进入设置；设置页短按移动选中项；设置页长按进入详情；详情或设置页双击返回
- 按住过程中的长按进度条只由设备端本地绘制，占顶部 5px；它会等按住约 300ms 后才显示，达到长按阈值后只进入 armed 状态，松开时才 POST `long_press`
