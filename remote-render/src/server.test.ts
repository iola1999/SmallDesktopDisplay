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
    expect(first.headers.get("transfer-encoding")).toBeNull();
    expect(first.headers.get("x-sdd-server-wait-ms")).toMatch(/^\d+$/);
    const body = Buffer.from(await first.arrayBuffer());
    expect(first.headers.get("content-length")).toBe(String(body.length));
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

  test("accepts a valid input event with 202", async () => {
    const response = await fetch(`${baseUrl}/api/v1/devices/desk-input/input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({seq: 1, event: "short_press", uptime_ms: 1000}),
    });

    expect(response.status).toBe(202);
  });

  test("returns 204 for commands when none queued and the queued command after a brightness change", async () => {
    const none = await fetch(`${baseUrl}/api/v1/devices/desk-cmd/commands?after=0`);
    expect(none.status).toBe(204);

    const post = (seq: number, event: string, uptimeMs: number) =>
      fetch(`${baseUrl}/api/v1/devices/desk-cmd/input`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({seq, event, uptime_ms: uptimeMs}),
      });
    await post(1, "long_press", 100); // home -> settings (Brightness selected)
    await post(2, "long_press", 200); // settings -> brightness detail
    await post(3, "short_press", 300); // adjust brightness -> queues set_brightness

    const queued = await fetch(`${baseUrl}/api/v1/devices/desk-cmd/commands?after=0`);
    expect(queued.status).toBe(200);
    await expect(queued.json()).resolves.toMatchObject({type: "set_brightness"});
  });

  test("returns 404 for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/api/v1/unknown`);
    expect(response.status).toBe(404);
  });

  test("returns 422 for malformed JSON instead of 500", async () => {
    const response = await fetch(`${baseUrl}/api/v1/devices/desk-bad-json/input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: "{bad json",
    });

    expect(response.status).toBe(422);
  });

  test("returns 422 for non-object JSON bodies instead of 500", async () => {
    const nullBody = await fetch(`${baseUrl}/api/v1/devices/desk-null/input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: "null",
    });
    expect(nullBody.status).toBe(422);

    const nullStatus = await fetch(`${baseUrl}/api/v1/devices/desk-null/status`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: "null",
    });
    expect(nullStatus.status).toBe(422);
  });

  test("rejects an oversized request body with 413 and stays responsive", async () => {
    const oversized = await fetch(`${baseUrl}/api/v1/devices/desk-big/input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: `{"seq":1,"event":"short_press","uptime_ms":1,"pad":"${"x".repeat(64 * 1024)}"}`,
    });
    expect(oversized.status).toBe(413);

    await expect(fetch(`${baseUrl}/api/v1/health`).then((response) => response.json())).resolves.toEqual({
      status: "ok",
    });
  });
});
