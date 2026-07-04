import {createRemoteRenderServer} from "./server.js";
import {startWeatherPolling} from "./renderer/services/weather.js";
import {createPrefsSaver, loadPrefs} from "./prefs-store.js";
import {SerialTransport} from "./serial/serial-transport.js";
import {DeviceRegistry} from "./state.js";

const port = Number(process.env.PORT ?? "8080");
// 设备偏好（主题/字体）落盘：容器重建后不再丢用户选择。
const stateDir = process.env.STATE_DIR ?? "./data";
const prefs = loadPrefs(stateDir);
const savePrefs = createPrefsSaver(stateDir);
const registry = new DeviceRegistry({
  initialPrefs: prefs,
  onPrefsChanged: (deviceId, changed) => {
    prefs[deviceId] = changed;
    savePrefs(prefs);
  },
});
console.log(`[RemoteRender] loaded prefs for ${Object.keys(prefs).length} device(s) from ${stateDir}`);
const server = createRemoteRenderServer(registry);

await server.listen(port, "0.0.0.0");
console.log(`[RemoteRender] listening on 0.0.0.0:${port}`);

// 后台定时拉取萧山天气（可选功能，失败静默，不影响时钟渲染）。
startWeatherPolling();

// 串口传输（可选）：设置 SERIAL_PORT（如 /dev/ttyUSB0）即启用，与 HTTP 并存。
// 设备端开机自动探测：串口上收到我们的 HELLO/帧就走串口，否则回落 WiFi。
// 端口打不开只告警不影响 HTTP；断开（USB 拔插）后每 5s 重试重开。
const serialPortPath = process.env.SERIAL_PORT ?? "";
if (serialPortPath !== "") {
  const baudRate = Number(process.env.SERIAL_BAUD ?? "921600");
  void startSerialTransport(serialPortPath, Number.isFinite(baudRate) && baudRate > 0 ? baudRate : 921600);
}

async function startSerialTransport(path: string, baudRate: number): Promise<void> {
  let SerialPortCtor: typeof import("serialport").SerialPort;
  try {
    ({SerialPort: SerialPortCtor} = await import("serialport"));
  } catch (error) {
    console.error(`[RemoteRender] serialport module unavailable, serial transport disabled: ${String(error)}`);
    return;
  }

  const openPort = () => {
    if (shuttingDown) {
      return;
    }
    let retried = false;
    const scheduleRetry = () => {
      if (retried || shuttingDown) {
        return;
      }
      retried = true;
      transport.stop();
      setTimeout(openPort, 5000);
    };

    const port = new SerialPortCtor({path, baudRate});
    const transport = new SerialTransport({registry, port});
    port.on("open", () => console.log(`[RemoteRender] serial transport on ${path} @${baudRate}`));
    port.on("error", (error: Error) => {
      console.error(`[RemoteRender] serial port error: ${error.message}`);
      scheduleRetry();
    });
    port.on("close", scheduleRetry);
    transport.start();
  };
  openPort();
}

// 容器停止时（docker stop 发送 SIGTERM）优雅关闭：停止接收新连接并让
// 正在进行的 long-poll 请求自然结束，而不是被硬杀。重复信号直接退出。
let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) {
      process.exit(0);
    }
    shuttingDown = true;
    console.log(`[RemoteRender] ${signal} received, shutting down`);
    server
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
  });
}
