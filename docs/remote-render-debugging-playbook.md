# Remote Render Debugging Playbook

这份文档记录远程渲染后端调试时最有用的实践，尤其是这次首页时钟翻动动画的排查过程。目标是以后遇到“设备上看起来不对”的问题时，先用代码和图片把问题钉住，再去改实现。

## 基本原则

- 先用测试或脚本复现具体帧，不要只凭肉眼猜。
- 能在 Node 里直接生成 PNG 的，就先生成 PNG；物理屏幕只用于最后确认。
- 修改 `remote-render/` 后必须重新 build/start Docker，否则设备和预览看到的还是旧容器。
- 主机 `127.0.0.1:18080` 可能被 `adb forward` 抢占；设备访问通常看 LAN 地址，例如 `http://192.168.1.7:18080`。
- 动画问题要区分两个时间源：渲染用的 wall-clock `Date` 和调度用的 monotonic `performance.now()`。

## 常用验证命令

```bash
cd remote-render
npm test
npm run build
REMOTE_RENDER_PORT=18080 docker compose up -d --build
curl -i --max-time 5 http://192.168.1.7:18080/api/v1/health
```

如果需要确认 Docker 容器内部服务是否真的起来：

```bash
docker compose ps
docker logs --tail 20 remote-render-remote-render-1
docker exec remote-render-remote-render-1 node -e "fetch('http://127.0.0.1:8080/api/v1/health').then(async r=>{console.log(r.status); console.log(await r.text())})"
```

如果 LAN 地址通、`127.0.0.1` 不通，先检查端口是否被 adb 或其他进程占用：

```bash
lsof -nP -iTCP:18080 -sTCP:LISTEN
adb forward --list
```

## 写最小测试

先写能描述失败边界的测试。比如这次“数字翻动看起来是硬切”，不要只测试模型存在，而要测试中间帧确实不是旧帧，也不是最终帧：

```ts
test("clock flip intermediate canvas differs from old and settled clock frames", () => {
  const previous = renderDeviceCanvas({
    currentTime: new Date("2026-05-01T12:59:59.900+08:00"),
    deviceId: "desk-01",
    buttonCount: 0,
  });
  const flipping = renderDeviceCanvas({
    currentTime: new Date("2026-05-01T13:00:00.900+08:00"),
    deviceId: "desk-01",
    buttonCount: 0,
    clockFlipProgress: 0.5,
  });
  const settled = renderDeviceCanvas({
    currentTime: new Date("2026-05-01T13:00:00.900+08:00"),
    deviceId: "desk-01",
    buttonCount: 0,
    clockFlipProgress: 1,
  });

  expect(Buffer.compare(flipping.rgba, previous.rgba)).not.toBe(0);
  expect(Buffer.compare(flipping.rgba, settled.rgba)).not.toBe(0);
});
```

这类测试能避免“代码里有动画字段，但实际画面还是硬切”的假阳性。

## 直接生成 PNG

需要看某个精确状态时，不必等真实设备或 HTTP polling。先跑 `npm run build`，然后直接调用渲染函数生成图片：

```bash
cd remote-render
npm run build
node --input-type=module -e '
import {createCanvas, ImageData} from "@napi-rs/canvas";
import {writeFile} from "node:fs/promises";
import {renderDeviceCanvas} from "./dist/renderer/index.js";

const image = renderDeviceCanvas({
  currentTime: new Date("2026-05-01T13:00:00.900+08:00"),
  deviceId: "mid-flip",
  buttonCount: 0,
  clockFlipProgress: 0.5,
});

const canvas = createCanvas(image.width, image.height);
canvas.getContext("2d").putImageData(
  new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height),
  0,
  0,
);
await writeFile("frame-previews/clock-flip-fixed-mid.png", canvas.encodeSync("png"));
console.log("saved frame-previews/clock-flip-fixed-mid.png");
'
```

生成后直接查看：

```text
remote-render/frame-previews/clock-flip-fixed-mid.png
```

这个方法适合验证单帧布局、颜色、裁剪、字体、动画中间态。

## 通过 HTTP 预览真实服务

Docker 启动后，用预览工具走完整 HTTP 帧协议：

```bash
cd remote-render
npm run preview -- \
  --base-url http://192.168.1.7:18080 \
  --device-id flip-fixed-live-01 \
  --frames 3 \
  --wait-ms 1200 \
  --output frame-previews/clock-flip-fixed-live.png
```

输出里要关注：

```text
1: frame=1 full rects=1
2: frame=2 partial rects=4
3: frame=3 partial rects=4
saved frame-previews/clock-flip-fixed-live.png
```

`full rects=1` 说明冷启动全屏帧正常；后续 `partial rects=...` 说明局部刷新链路正常。如果预览一直只有 full frame，要看 server 端是否判断 partial base frame 不安全；如果一直是 204，要看帧调度有没有真的生成新 frame id。

## 验证输入事件

首页双击强制全屏刷新可以用脚本直接打 HTTP：

```bash
cd remote-render
node --input-type=module -e '
import {decodeFrame} from "./dist/tools/frame-preview.js";

const base = "http://192.168.1.7:18080";
const id = "home-refresh-check";
const first = await fetch(`${base}/api/v1/devices/${id}/frame?have=0&wait_ms=0`);
const firstFrame = decodeFrame(Buffer.from(await first.arrayBuffer()));

await fetch(`${base}/api/v1/devices/${id}/input`, {
  method: "POST",
  headers: {"content-type": "application/json"},
  body: JSON.stringify({seq: 1, event: "double_press", uptime_ms: 1000}),
});

const second = await fetch(`${base}/api/v1/devices/${id}/frame?have=${firstFrame.frameId}&wait_ms=1`);
const secondFrame = decodeFrame(Buffer.from(await second.arrayBuffer()));
console.log(JSON.stringify({
  status: second.status,
  fullFrame: secondFrame.fullFrame,
  rects: secondFrame.rects.length,
  width: secondFrame.rects[0].width,
  height: secondFrame.rects[0].height,
}));
'
```

期望输出类似：

```json
{"status":200,"fullFrame":true,"rects":1,"width":240,"height":240}
```

## 这次时钟翻动的具体教训

### 1. 动画进度不能靠 `Date.getMilliseconds()`

错误方向：

```ts
function flipProgress(currentTime: Date, durationMs: number): number {
  return Math.min(1, currentTime.getMilliseconds() / durationMs);
}
```

问题是 Registry 的帧调度用 monotonic 时间，渲染文案用 wall-clock `Date`。两者不保证对齐。设备请求下一帧时，`Date.getMilliseconds()` 可能已经超过动画窗口，结果直接得到终态，看起来就是硬切。

正确方向：由 Registry 计算 `elapsed / clockFlipAnimationSeconds`，通过 `clockFlipProgress` 显式传入 renderer。这样测试和真实服务能控制同一个进度。

### 2. 视觉翻动需要裁剪槽

只把旧数字和新数字改变 `y` 位置还不够；如果没有 `overflow: hidden` 的数字槽，两个数字会同时露在外面，看起来不像翻动。

当前做法：

- 每个变化的数字放进一个固定宽高的 `Box`。
- `Box` 设置 `overflow: "hidden"` 和背景色。
- 旧数字从槽内向上滑出，新数字从下方滑入。
- rasterizer 支持 `opacity` 和 `clip()`。

### 3. 嵌套组件要有递归 Yoga 树

加入数字槽后，页面结构从一层 host node 变成嵌套 host node。原来的 rasterizer 只给第一层 child 建 Yoga 节点，读嵌套 layout 时会拿到 `null`。修正方式是递归构建 Yoga 树，再递归读取布局。

### 4. 预览图比口头感觉可靠

这次的判断顺序应该是：

1. 测试证明中间帧不是旧帧/终帧。
2. 直接生成 `clockFlipProgress: 0.5` 的 PNG，看单帧是否像动画中段。
3. Docker 重启后走 HTTP preview，确认真实服务连续返回局部动画帧。
4. 最后再看物理设备。

## 何时需要重启 Docker

只要改了这些内容，就重启：

- `remote-render/src/renderer/**`
- `remote-render/src/state.ts`
- `remote-render/src/server.ts`
- `remote-render/package*.json`
- `remote-render/tsconfig.json`
- `remote-render/Dockerfile`

标准命令：

```bash
cd remote-render
REMOTE_RENDER_PORT=18080 docker compose up -d --build
```

不要用会移除 `restart: unless-stopped` 容器语义的清理方式替代正常重启。
