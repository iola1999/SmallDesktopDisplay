# SmallDesktopDisplay

基于 ESP-12E 模块的桌面小屏显示器固件，使用 PlatformIO + Arduino framework。当前硬件固件仍通过 PlatformIO 的 `espressif8266` 平台和 `nodemcuv2` 板型配置构建。

当前主线已切换为远程渲染瘦客户端：Docker 服务负责生成 240x240 RGB565 帧，设备只负责 WiFi、按键上报、HTTP 拉取最新帧和 TFT 刷屏。旧天气、NTP、设置页动效和本地复杂 UI 代码已删除。

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

- `remote-render/*`: Dockerized FastAPI + Pillow 渲染服务
- `src/remote/*`: HTTP 帧协议、帧拉取、按键事件上报
- `src/ui/TftFrameSink.*`: RGB565 矩形帧到 TFT 的输出桥接
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

## Button Controls

- 短按、双击、长按由设备识别后 POST 给远程渲染服务
- 设备本地不再解释页面业务逻辑
