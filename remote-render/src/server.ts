import http, {type IncomingMessage, type ServerResponse} from "node:http";

import {DeviceRegistry} from "./state.js";
import type {InputEventName} from "./ui-state.js";

export interface RemoteRenderServer {
  listen(port: number, hostname?: string): Promise<void>;
  close(): Promise<void>;
  address(): ReturnType<http.Server["address"]>;
}

export function createRemoteRenderServer(registry = new DeviceRegistry()): RemoteRenderServer {
  const server = http.createServer((request, response) => {
    handleRequest(registry, request, response).catch((error: unknown) => {
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
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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
