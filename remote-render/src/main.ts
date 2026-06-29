import {createRemoteRenderServer} from "./server.js";
import {startWeatherPolling} from "./renderer/services/weather.js";

const port = Number(process.env.PORT ?? "8080");
const server = createRemoteRenderServer();

await server.listen(port, "0.0.0.0");
console.log(`[RemoteRender] listening on 0.0.0.0:${port}`);

// 后台定时拉取萧山天气（可选功能，失败静默，不影响时钟渲染）。
startWeatherPolling();

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
