import {describe, expect, test} from "vitest";

import {
  ENVELOPE_HEADER_SIZE,
  EnvelopeParser,
  MSG_DEVICE_HELLO,
  MSG_FRAME_ACK,
  MSG_INPUT,
  encodeEnvelope,
} from "./envelope.js";

function helloPayload(): Buffer {
  return Buffer.from(JSON.stringify({device_id: "desk-01", proto: 1}), "utf8");
}

describe("serial envelope", () => {
  test("encodes an 11-byte header and round-trips through the parser", () => {
    const payload = helloPayload();
    const wire = encodeEnvelope(MSG_DEVICE_HELLO, payload);
    expect(wire.length).toBe(ENVELOPE_HEADER_SIZE + payload.length);

    const parser = new EnvelopeParser();
    const events = parser.feed(wire);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({kind: "message", type: MSG_DEVICE_HELLO});
    expect((events[0] as {payload: Buffer}).payload.equals(payload)).toBe(true);
  });

  test("parses multiple messages from one chunk and across byte-by-byte chunks", () => {
    const first = encodeEnvelope(MSG_FRAME_ACK, Buffer.from(JSON.stringify({frame_id: 7})));
    const second = encodeEnvelope(MSG_INPUT, Buffer.from(JSON.stringify({seq: 1, event: "short_press", uptime_ms: 5})));
    const wire = Buffer.concat([first, second]);

    const oneShot = new EnvelopeParser();
    expect(oneShot.feed(wire).filter((event) => event.kind === "message")).toHaveLength(2);

    const dribble = new EnvelopeParser();
    const collected: number[] = [];
    for (const byte of wire) {
      for (const event of dribble.feed(Buffer.from([byte]))) {
        if (event.kind === "message") collected.push(event.type);
      }
    }
    expect(collected).toEqual([MSG_FRAME_ACK, MSG_INPUT]);
  });

  test("passes through firmware log text between envelopes as log lines", () => {
    const parser = new EnvelopeParser();
    const wire = Buffer.concat([
      Buffer.from("[SDD V1.5.0] remote display boot\r\n", "utf8"),
      encodeEnvelope(MSG_DEVICE_HELLO, helloPayload()),
      Buffer.from("[RemoteFrame] frame=3 partial rects=2\n", "utf8"),
    ]);

    const events = parser.feed(wire);
    expect(events.map((event) => event.kind)).toEqual(["log", "message", "log"]);
    expect(events[0]).toMatchObject({line: "[SDD V1.5.0] remote display boot"});
    expect(events[2]).toMatchObject({line: "[RemoteFrame] frame=3 partial rects=2"});
  });

  test("skips corrupt envelopes and stray magic bytes, then recovers on the next valid one", () => {
    const good = encodeEnvelope(MSG_FRAME_ACK, Buffer.from(JSON.stringify({frame_id: 9})));

    const corrupted = encodeEnvelope(MSG_FRAME_ACK, Buffer.from(JSON.stringify({frame_id: 8})));
    corrupted[ENVELOPE_HEADER_SIZE] ^= 0xff; // 破坏 payload → CRC 不匹配

    const strayMagic = Buffer.from([0xa5, 0x5a, 0x99, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0]); // 非法 type + 疯狂长度

    const parser = new EnvelopeParser();
    const events = parser.feed(Buffer.concat([strayMagic, corrupted, good, Buffer.from("\n")]));
    const messages = events.filter((event) => event.kind === "message");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({type: MSG_FRAME_ACK});
    expect(JSON.parse((messages[0] as {payload: Buffer}).payload.toString("utf8"))).toEqual({frame_id: 9});
  });

  test("keeps a magic byte split across chunk boundaries", () => {
    const wire = encodeEnvelope(MSG_INPUT, Buffer.from(JSON.stringify({seq: 2, event: "long_press", uptime_ms: 9})));
    const parser = new EnvelopeParser();

    expect(parser.feed(Buffer.concat([Buffer.from("noise", "utf8"), wire.subarray(0, 1)]))).toEqual([]);
    const events = parser.feed(wire.subarray(1));
    const messages = events.filter((event) => event.kind === "message");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({type: MSG_INPUT});
  });
});
