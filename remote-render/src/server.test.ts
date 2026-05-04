import {afterEach, beforeEach, describe, expect, test} from "vitest";

import {createRemoteRenderServer, type RemoteRenderServer} from "./server.js";

describe("Node HTTP API", () => {
  let server: RemoteRenderServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = createRemoteRenderServer();
    await server.listen(0, "127.0.0.1");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("server did not bind to TCP");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  test("serves health and frame endpoints with the existing URL contract", async () => {
    await expect(fetch(`${baseUrl}/api/v1/health`).then((response) => response.json())).resolves.toEqual({
      status: "ok",
    });

    const first = await fetch(`${baseUrl}/api/v1/devices/desk-01/frame?have=0`);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("application/octet-stream");
    expect(first.headers.get("x-sdd-server-wait-ms")).toMatch(/^\d+$/);
    const body = Buffer.from(await first.arrayBuffer());
    const frameId = body.readUInt32LE(8);

    const second = await fetch(`${baseUrl}/api/v1/devices/desk-01/frame?have=${frameId}&wait_ms=1`);
    expect(second.status).toBe(204);
  });

  test("validates status payload fields like the previous API contract", async () => {
    const invalid = await fetch(`${baseUrl}/api/v1/devices/desk-invalid/status`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({brightness: 101, uptime_ms: 1234}),
    });

    expect(invalid.status).toBe(422);
  });
});
