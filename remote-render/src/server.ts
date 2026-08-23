import http, {type IncomingMessage, type ServerResponse} from "node:http";
import {readFileSync, statSync} from "node:fs";
import path from "node:path";

import {
  CONFIG_SCHEMA_VERSION,
  FONT_CATALOG,
  HOME_LAYOUT_CATALOG,
  THEME_CATALOG,
  ConfigValidationError,
  isValidDeviceId,
  mergeDeviceConfig,
  parseDeviceConfigPatch,
} from "./config/schema.js";
import {
  ConfigHistoryRevisionNotFoundError,
  ConfigRevisionConflictError,
  ConfigStore,
  ConfigStoreReadOnlyError,
  configHistoryResponse,
  configResponse,
} from "./config/store.js";
import {encodeCanvasImagePng} from "./renderer/rendering/png.js";
import {WEATHER_LOCATION_LABEL, getWeatherSnapshot} from "./renderer/services/weather.js";
import {DeviceRegistry} from "./state.js";
import {FONT_OPTIONS, THEME_OPTIONS, type InputEventName} from "./ui-state.js";

export interface RemoteRenderServer {
  listen(port: number, hostname?: string): Promise<void>;
  close(): Promise<void>;
  address(): ReturnType<http.Server["address"]>;
}

export interface RemoteRenderServerOptions {
  configStore?: ConfigStore;
  consoleDir?: string;
}

// 把客户端请求错误（坏 JSON、超大请求体）映射成正确的 4xx 状态码，
// 防止它们冒泡成 500 internal server error 并污染日志。
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
const CONSOLE_BUILD_REQUIRED_HTML =
  "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><title>SmallDesktopDisplay 控制台</title><body><main><h1>SmallDesktopDisplay 控制台</h1><p>控制台资源尚未构建。</p></main></body></html>";

export function createRemoteRenderServer(
  registry = new DeviceRegistry(),
  options: RemoteRenderServerOptions = {},
): RemoteRenderServer {
  const configStore = options.configStore ?? new ConfigStore();
  const consoleDir = options.consoleDir ?? path.resolve(process.cwd(), "dist", "console");
  // noDelay：帧响应是小包一问一答，禁用 Nagle 免得与设备端 delayed-ACK
  // 相互等待放大延迟（Node 22 默认已为 true，这里显式声明意图）。
  const server = http.createServer({noDelay: true}, (request, response) => {
    setSecurityHeaders(response);
    handleRequest(registry, configStore, consoleDir, request, response).catch((error: unknown) => {
      if (error instanceof HttpError) {
        sendJson(response, error.status, {detail: error.detail});
        return;
      }
      if (error instanceof ConfigRevisionConflictError) {
        response.setHeader("etag", revisionEtag(error.currentRevision));
        sendJson(response, 409, {detail: "revision conflict", currentRevision: error.currentRevision});
        return;
      }
      if (error instanceof ConfigHistoryRevisionNotFoundError) {
        sendJson(response, 404, {detail: "config history revision not found", revision: error.revision});
        return;
      }
      if (error instanceof ConfigValidationError) {
        sendJson(response, 422, {detail: error.message});
        return;
      }
      if (error instanceof ConfigStoreReadOnlyError) {
        sendJson(response, 503, {detail: error.message});
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
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          try {
            configStore.flush();
            resolve();
          } catch (flushError) {
            reject(flushError);
          }
        });
      });
    },
    address() {
      return server.address();
    },
  };
}

async function handleRequest(
  registry: DeviceRegistry,
  configStore: ConfigStore,
  consoleDir: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  validateWriteRequest(request);
  if (request.method === "GET" && url.pathname === "/api/v1/health") {
    sendJson(response, 200, {status: "ok"});
    return;
  }

  if (request.method === "GET" && serveConsoleAsset(consoleDir, url.pathname, response)) {
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/catalog") {
    sendJson(response, 200, {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      themes: THEME_CATALOG,
      fonts: FONT_CATALOG,
      homeLayouts: HOME_LAYOUT_CATALOG,
      brightness: {min: 0, max: 100, step: 5, storage: "device"},
    });
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
      config: {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        revision: configStore.revision,
        writable: configStore.readOnlyReason === null,
        error: configStore.readOnlyReason,
      },
    });
    return;
  }

  const configMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/config$/);
  if (configMatch) {
    const deviceId = decodeDeviceId(configMatch[1]);
    if (request.method === "GET") {
      response.setHeader("etag", revisionEtag(configStore.revision));
      sendJson(response, 200, configResponse(configStore, deviceId));
      return;
    }
    if (request.method === "PATCH") {
      const expectedRevision = parseIfMatch(request.headers["if-match"]);
      const payload = await readJson(request);
      const input = Object.prototype.hasOwnProperty.call(payload, "config") ? payload.config : payload;
      const config = configStore.patchDeviceConfig(deviceId, input, expectedRevision);
      registry.applyDeviceConfig(deviceId, config);
      response.setHeader("etag", revisionEtag(configStore.revision));
      sendJson(response, 200, configResponse(configStore, deviceId));
      return;
    }
  }

  const configHistoryMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/config\/history$/);
  if (request.method === "GET" && configHistoryMatch) {
    const deviceId = decodeDeviceId(configHistoryMatch[1]);
    const body = configHistoryResponse(configStore, deviceId);
    response.setHeader("etag", revisionEtag(body.currentRevision));
    sendJson(response, 200, body);
    return;
  }

  const configPublishMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/config\/publish$/);
  if (request.method === "POST" && configPublishMatch) {
    const deviceId = decodeDeviceId(configPublishMatch[1]);
    const expectedRevision = parseIfMatch(request.headers["if-match"]);
    await readJson(request);
    configStore.publishDeviceConfig(deviceId, expectedRevision);
    response.setHeader("etag", revisionEtag(configStore.revision));
    sendJson(response, 200, configResponse(configStore, deviceId));
    return;
  }

  const configRollbackMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/config\/rollback$/);
  if (request.method === "POST" && configRollbackMatch) {
    const deviceId = decodeDeviceId(configRollbackMatch[1]);
    const expectedRevision = parseIfMatch(request.headers["if-match"]);
    const payload = await readJson(request);
    if (!isInt(payload.revision, 0)) {
      throw new HttpError(422, "revision must be a non-negative integer");
    }
    const config = configStore.rollbackDeviceConfig(deviceId, payload.revision, expectedRevision);
    registry.applyDeviceConfig(deviceId, config);
    response.setHeader("etag", revisionEtag(configStore.revision));
    sendJson(response, 200, configResponse(configStore, deviceId));
    return;
  }

  const draftPreviewMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/preview$/);
  if (request.method === "POST" && draftPreviewMatch) {
    const deviceId = decodeDeviceId(draftPreviewMatch[1]);
    const payload = await readJson(request);
    if (!Object.prototype.hasOwnProperty.call(payload, "config")) {
      throw new HttpError(422, "config is required");
    }
    const patch = parseDeviceConfigPatch(payload.config);
    const config = mergeDeviceConfig(configStore.getDeviceConfig(deviceId), patch);
    const png = encodeCanvasImagePng(registry.renderConfigPreview(deviceId, config));
    response.writeHead(200, {"content-type": "image/png", "content-length": String(png.length), "cache-control": "no-store"});
    response.end(png);
    return;
  }

  const previewMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/preview\.png$/);
  if (request.method === "GET" && previewMatch) {
    const png = encodeCanvasImagePng(registry.getPreviewImage(decodeDeviceId(previewMatch[1])));
    response.writeHead(200, {"content-type": "image/png", "content-length": String(png.length), "cache-control": "no-store"});
    response.end(png);
    return;
  }

  const prefsMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/prefs$/);
  if (request.method === "POST" && prefsMatch) {
    const deviceId = decodeDeviceId(prefsMatch[1]);
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
    if (hasTheme || hasFont) {
      configStore.updateDeviceAppearance(deviceId, {
        ...(hasTheme ? {themeKey: payload.themeKey} : {}),
        ...(hasFont ? {fontKey: payload.fontKey} : {}),
      });
    }
    sendJson(response, 200, registry.applyPrefs(deviceId, payload, {emitPrefsChanged: false}));
    return;
  }

  const consoleInputMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/console-input$/);
  if (request.method === "POST" && consoleInputMatch) {
    const deviceId = decodeDeviceId(consoleInputMatch[1]);
    const payload = await readJson(request);
    if (!["short_press", "double_press", "long_press"].includes(payload.event)) {
      sendJson(response, 422, {detail: "invalid gesture"});
      return;
    }
    registry.applyConsoleGesture(deviceId, payload.event as InputEventName);
    response.writeHead(202, {"content-length": "0"});
    response.end();
    return;
  }

  const frameMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/frame$/);
  if (request.method === "GET" && frameMatch) {
    const deviceId = decodeDeviceId(frameMatch[1]);
    const have = parseBoundedInt(url.searchParams.get("have"), 0, Number.MAX_SAFE_INTEGER, 0);
    const waitMs = parseBoundedInt(url.searchParams.get("wait_ms"), 0, 5000, 250);
    const result = await registry.getFrameWithStats(deviceId, have, waitMs);
    const headers = {
      "X-SDD-Server-Wait-Ms": String(result.waitMs),
      "X-SDD-Server-Render-Ms": String(result.renderMs),
      "X-SDD-Server-Total-Ms": String(result.totalMs),
      // 命令通道的驱动信号：设备比对本地命令水位，仅在这里出现更新的 id 时
      // 才真正 GET /commands，取代旧的每 100ms 盲轮询。
      "X-SDD-Cmd": String(result.commandId),
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
    const deviceId = decodeDeviceId(inputMatch[1]);
    const payload = await readJson(request);
    if (!isInt(payload.seq, 1) || !["short_press", "double_press", "long_press"].includes(payload.event) || !isInt(payload.uptime_ms, 0)) {
      sendJson(response, 422, {detail: "invalid input event"});
      return;
    }
    registry.recordInput(deviceId, payload.seq, payload.event as InputEventName, payload.uptime_ms);
    response.writeHead(202, {"content-length": "0"});
    response.end();
    return;
  }

  const commandMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/commands$/);
  if (request.method === "GET" && commandMatch) {
    const deviceId = decodeDeviceId(commandMatch[1]);
    const after = parseBoundedInt(url.searchParams.get("after"), 0, Number.MAX_SAFE_INTEGER, 0);
    const command = registry.getCommand(deviceId, after);
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
    const deviceId = decodeDeviceId(statusMatch[1]);
    const payload = await readJson(request);
    if (!isInt(payload.brightness, 0, 100) || !isInt(payload.uptime_ms, 0)) {
      sendJson(response, 422, {detail: "invalid device status"});
      return;
    }
    if (
      (payload.heap_free !== undefined && !isInt(payload.heap_free, 0)) ||
      (payload.heap_max_block !== undefined && !isInt(payload.heap_max_block, 0)) ||
      (payload.heap_fragmentation !== undefined && !isInt(payload.heap_fragmentation, 0, 100)) ||
      (payload.wifi_rssi !== undefined && !isInt(payload.wifi_rssi, -127, 0))
    ) {
      sendJson(response, 422, {detail: "invalid device diagnostics"});
      return;
    }
    registry.recordStatus(deviceId, {
      brightness: payload.brightness,
      uptimeMs: payload.uptime_ms,
      heapFree: payload.heap_free,
      heapMaxBlock: payload.heap_max_block,
      heapFragmentation: payload.heap_fragmentation,
      wifiRssi: payload.wifi_rssi,
    });
    response.writeHead(202, {"content-length": "0"});
    response.end();
    return;
  }

  sendJson(response, 404, {detail: "not found"});
}

const CONSOLE_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function serveConsoleAsset(consoleDir: string, pathname: string, response: ServerResponse): boolean {
  const isIndex = pathname === "/" || pathname === "/console" || pathname === "/console/";
  if (!isIndex && !pathname.startsWith("/console/")) return false;
  const encodedRelative = isIndex ? "index.html" : pathname.slice("/console/".length);
  let relative: string;
  try {
    relative = decodeURIComponent(encodedRelative);
  } catch {
    throw new HttpError(422, "invalid console asset path");
  }
  const resolved = path.resolve(consoleDir, relative);
  const root = path.resolve(consoleDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(404, "not found");
  }
  try {
    if (!statSync(resolved).isFile()) throw new Error("not a file");
    const body = readFileSync(resolved);
    const extension = path.extname(resolved).toLowerCase();
    response.writeHead(200, {
      "content-type": CONSOLE_CONTENT_TYPES[extension] ?? "application/octet-stream",
      "content-length": String(body.length),
      "cache-control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
    });
    response.end(body);
    return true;
  } catch {
    if (!isIndex) return false;
    const body = Buffer.from(CONSOLE_BUILD_REQUIRED_HTML, "utf8");
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": String(body.length),
      "cache-control": "no-store",
    });
    response.end(body);
    return true;
  }
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
}

function validateWriteRequest(request: IncomingMessage): void {
  if (!request.method || !["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return;
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new HttpError(415, "content-type must be application/json");
  }
  const origin = request.headers.origin;
  if (origin === undefined) return;
  if (typeof origin !== "string") throw new HttpError(403, "origin is not allowed");
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, "origin is not allowed");
  }
  const host = request.headers.host;
  if (!host || !["http:", "https:"].includes(parsed.protocol) || parsed.host !== host) {
    throw new HttpError(403, "origin is not allowed");
  }
}

function decodeDeviceId(encoded: string): string {
  let deviceId: string;
  try {
    deviceId = decodeURIComponent(encoded);
  } catch {
    throw new HttpError(422, "invalid device id");
  }
  if (!isValidDeviceId(deviceId)) {
    throw new HttpError(422, "invalid device id");
  }
  return deviceId;
}

function revisionEtag(revision: number): string {
  return `"${revision}"`;
}

function parseIfMatch(value: string | string[] | undefined): number {
  if (value === undefined) throw new HttpError(428, "If-Match is required");
  if (Array.isArray(value)) throw new HttpError(422, "invalid If-Match");
  const match = /^"(\d+)"$/.exec(value.trim());
  if (!match) throw new HttpError(422, "invalid If-Match");
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision)) throw new HttpError(422, "invalid If-Match");
  return revision;
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
  // 只接受 JSON 对象；null / 数字 / 数组等负载统一当成空对象，
  // 后续字段校验会返回 422，属性访问也不会抛出 TypeError -> 500。
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
