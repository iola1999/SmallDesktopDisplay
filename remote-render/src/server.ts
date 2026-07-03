import http, {type IncomingMessage, type ServerResponse} from "node:http";

import {CONSOLE_HTML} from "./console.js";
import {encodeCanvasImagePng} from "./renderer/rendering/png.js";
import {WEATHER_LOCATION_LABEL, getWeatherSnapshot} from "./renderer/services/weather.js";
import {DeviceRegistry} from "./state.js";
import {FONT_OPTIONS, THEME_OPTIONS, type InputEventName} from "./ui-state.js";

export interface RemoteRenderServer {
  listen(port: number, hostname?: string): Promise<void>;
  close(): Promise<void>;
  address(): ReturnType<http.Server["address"]>;
}

// 用于把客户端请求错误（坏 JSON、超大请求体）映射成正确的 4xx 状态码，
// 而不是让它们冒泡成 500 internal server error 并污染日志。
class HttpError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

// 请求体上限。合法的 input/status 负载只有几个小整数，16KB 足够宽松。
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

export function createRemoteRenderServer(registry = new DeviceRegistry()): RemoteRenderServer {
  const server = http.createServer((request, response) => {
    handleRequest(registry, request, response).catch((error: unknown) => {
      if (error instanceof HttpError) {
        sendJson(response, error.status, {detail: error.detail});
        return;
      }
      console.error(error);
      sendJson(response, 500, {detail: "internal server error"});
    });
  });
  return {
    listen(port: number, hostname = "0.0.0.0") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostname, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
    address() {
      return server.address();
    },
  };
}

async function handleRequest(registry: DeviceRegistry, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/api/v1/health") {
    sendJson(response, 200, {status: "ok"});
    return;
  }

  // Web 控制台（局域网免登录）：预览 + 主题/字体/亮度 + 手势模拟。
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/console")) {
    const body = Buffer.from(CONSOLE_HTML, "utf8");
    response.writeHead(200, {"content-type": "text/html; charset=utf-8", "content-length": String(body.length)});
    response.end(body);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/devices") {
    sendJson(response, 200, {devices: registry.listDevices()});
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/status") {
    const snapshot = getWeatherSnapshot();
    sendJson(response, 200, {
      weather: snapshot
        ? {hasData: true, location: WEATHER_LOCATION_LABEL, ageSeconds: Math.max(0, Math.round((Date.now() - snapshot.fetchedAtMs) / 1000))}
        : {hasData: false, location: WEATHER_LOCATION_LABEL},
      deviceCount: registry.devices.size,
    });
    return;
  }

  const previewMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/preview\.png$/);
  if (request.method === "GET" && previewMatch) {
    const png = encodeCanvasImagePng(registry.getPreviewImage(decodeURIComponent(previewMatch[1])));
    response.writeHead(200, {"content-type": "image/png", "content-length": String(png.length), "cache-control": "no-store"});
    response.end(png);
    return;
  }

  const prefsMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/prefs$/);
  if (request.method === "POST" && prefsMatch) {
    const payload = await readJson(request);
    const hasTheme = payload.themeKey !== undefined;
    const hasFont = payload.fontKey !== undefined;
    const hasBrightness = payload.brightness !== undefined;
    if (!hasTheme && !hasFont && !hasBrightness) {
      sendJson(response, 422, {detail: "no prefs given"});
      return;
    }
    if (hasTheme && !(THEME_OPTIONS as readonly string[]).includes(payload.themeKey)) {
      sendJson(response, 422, {detail: "unknown themeKey"});
      return;
    }
    if (hasFont && !(FONT_OPTIONS as readonly string[]).includes(payload.fontKey)) {
      sendJson(response, 422, {detail: "unknown fontKey"});
      return;
    }
    if (hasBrightness && !isInt(payload.brightness, 0, 100)) {
      sendJson(response, 422, {detail: "brightness must be 0-100"});
      return;
    }
    sendJson(response, 200, registry.applyPrefs(decodeURIComponent(prefsMatch[1]), payload));
    return;
  }

  const consoleInputMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/console-input$/);
  if (request.method === "POST" && consoleInputMatch) {
    const payload = await readJson(request);
    if (!["short_press", "double_press", "long_press"].includes(payload.event)) {
      sendJson(response, 422, {detail: "invalid gesture"});
      return;
    }
    registry.applyConsoleGesture(decodeURIComponent(consoleInputMatch[1]), payload.event as InputEventName);
    response.writeHead(202, {"content-length": "0"});
    response.end();
    return;
  }

  const frameMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/frame$/);
  if (request.method === "GET" && frameMatch) {
    const have = parseBoundedInt(url.searchParams.get("have"), 0, Number.MAX_SAFE_INTEGER, 0);
    const waitMs = parseBoundedInt(url.searchParams.get("wait_ms"), 0, 5000, 250);
    const result = await registry.getFrameWithStats(decodeURIComponent(frameMatch[1]), have, waitMs);
    const headers = {
      "X-SDD-Server-Wait-Ms": String(result.waitMs),
      "X-SDD-Server-Render-Ms": String(result.renderMs),
      "X-SDD-Server-Total-Ms": String(result.totalMs),
    };
    if (result.frame === null) {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(result.frame.length),
      ...headers,
    });
    response.end(result.frame);
    return;
  }

  const inputMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/input$/);
  if (request.method === "POST" && inputMatch) {
    const payload = await readJson(request);
    if (!isInt(payload.seq, 1) || !["short_press", "double_press", "long_press"].includes(payload.event) || !isInt(payload.uptime_ms, 0)) {
      sendJson(response, 422, {detail: "invalid input event"});
      return;
    }
    registry.recordInput(decodeURIComponent(inputMatch[1]), payload.seq, payload.event as InputEventName, payload.uptime_ms);
    response.writeHead(202, {"content-length": "0"});
    response.end();
    return;
  }

  const commandMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/commands$/);
  if (request.method === "GET" && commandMatch) {
    const after = parseBoundedInt(url.searchParams.get("after"), 0, Number.MAX_SAFE_INTEGER, 0);
    const command = registry.getCommand(decodeURIComponent(commandMatch[1]), after);
    if (command === null) {
      response.writeHead(204);
      response.end();
      return;
    }
    sendJson(response, 200, command);
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/status$/);
  if (request.method === "POST" && statusMatch) {
    const payload = await readJson(request);
    if (!isInt(payload.brightness, 0, 100) || !isInt(payload.uptime_ms, 0)) {
      sendJson(response, 422, {detail: "invalid device status"});
      return;
    }
    const heapFragmentation = payload.heap_fragmentation ?? 0;
    const wifiRssi = payload.wifi_rssi ?? 0;
    if (!isInt(payload.heap_free ?? 0, 0) || !isInt(payload.heap_max_block ?? 0, 0) || !isInt(heapFragmentation, 0, 100) || !isInt(wifiRssi, -127, 0)) {
      sendJson(response, 422, {detail: "invalid device diagnostics"});
      return;
    }
    registry.recordStatus(decodeURIComponent(statusMatch[1]), {
      brightness: payload.brightness,
      uptimeMs: payload.uptime_ms,
      heapFree: payload.heap_free ?? 0,
      heapMaxBlock: payload.heap_max_block ?? 0,
      heapFragmentation,
      wifiRssi,
    });
    response.writeHead(202, {"content-length": "0"});
    response.end();
    return;
  }

  sendJson(response, 404, {detail: "not found"});
}

function parseBoundedInt(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

async function readJson(request: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_REQUEST_BODY_BYTES) {
      throw new HttpError(413, "payload too large");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(422, "invalid JSON");
  }
  // 只接受 JSON 对象；null / 数字 / 数组等非对象负载统一当成空对象，
  // 让后续字段校验返回 422，而不是在属性访问时抛 TypeError -> 500。
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, any>;
}

function isInt(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(body)),
  });
  response.end(body);
}
