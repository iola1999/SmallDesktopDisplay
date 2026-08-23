import {describe, expect, test} from "vitest";

import {draftReducer, initialDraftState} from "./draft";
import type {DeviceConfigDocument} from "./types";

function document(revision: number): DeviceConfigDocument {
  return {
    schemaVersion: 1,
    revision,
    etag: `"${revision}"`,
    deviceId: "desk-draft",
    config: {
      appearance: {themeKey: "midnight", fontKey: "lxgw_wenkai_screen"},
      home: {
        layout: "balanced",
        header: {showDate: true, showLunar: true},
        weather: {showCurrent: true, showTodayRange: true, showDailyOutlook: true},
      },
    },
  };
}

describe("draftReducer", () => {
  test("keeps local edits and adopts unrelated remote fields", () => {
    let state = draftReducer(initialDraftState, {type: "hydrate", document: document(0)});
    state = draftReducer(state, {type: "set-theme", value: "amber"});
    const remote = document(1);
    remote.config.appearance.fontKey = "noto_cjk";

    state = draftReducer(state, {type: "hydrate", document: remote});

    expect(state.config?.appearance).toEqual({themeKey: "amber", fontKey: "noto_cjk"});
    expect(state.document).toBe(remote);
    expect(state.dirty).toBe(true);
    expect(state.conflict).toBe(true);
  });

  test("rebases a conflict without clearing the local draft", () => {
    let state = draftReducer(initialDraftState, {type: "hydrate", document: document(0)});
    state = draftReducer(state, {type: "set-layout", value: "weather"});
    state = draftReducer(state, {type: "conflict", value: true});
    const remote = document(2);
    remote.config.home.header.showDate = false;

    state = draftReducer(state, {type: "rebase", document: remote});

    expect(state.config?.home.layout).toBe("weather");
    expect(state.config?.home.header.showDate).toBe(false);
    expect(state.dirty).toBe(true);
    expect(state.conflict).toBe(false);
    expect(state.document?.etag).toBe('"2"');
  });

  test("ignores an older rebase result for the current device", () => {
    let state = draftReducer(initialDraftState, {type: "hydrate", document: document(3)});
    state = draftReducer(state, {type: "set-layout", value: "weather"});
    state = draftReducer(state, {type: "conflict", value: true});
    const late = document(2);
    late.config.home.header.showDate = false;

    const next = draftReducer(state, {type: "rebase", document: late});

    expect(next).toBe(state);
    expect(next.document?.revision).toBe(3);
    expect(next.config?.home.layout).toBe("weather");
    expect(next.config?.home.header.showDate).toBe(true);
    expect(next.conflict).toBe(true);
  });

  test("cancel returns to the latest server baseline", () => {
    let state = draftReducer(initialDraftState, {type: "hydrate", document: document(0)});
    state = draftReducer(state, {type: "set-theme", value: "amber"});
    const remote = document(1);
    remote.config.appearance.fontKey = "noto_cjk";
    state = draftReducer(state, {type: "hydrate", document: remote});

    state = draftReducer(state, {type: "reset"});

    expect(state.config).toEqual(remote.config);
    expect(state.dirty).toBe(false);
    expect(state.conflict).toBe(false);
  });

  test("keeps a revision conflict until the latest version is read", () => {
    let state = draftReducer(initialDraftState, {type: "hydrate", document: document(0)});
    state = draftReducer(state, {type: "set-theme", value: "amber"});
    state = draftReducer(state, {type: "conflict", value: true});

    state = draftReducer(state, {type: "set-font", value: "noto_cjk"});

    expect(state.conflict).toBe(true);
    expect(state.config?.appearance).toEqual({themeKey: "amber", fontKey: "noto_cjk"});
  });

  test("ignores a late save result for another device", () => {
    const current = document(3);
    current.deviceId = "desk-current";
    let state = draftReducer(initialDraftState, {type: "hydrate", document: current});
    const late = document(4);
    late.deviceId = "desk-old";

    state = draftReducer(state, {type: "saved", document: late, sentConfig: late.config});

    expect(state.document).toBe(current);
  });

  test("ignores an older save result for the current device", () => {
    const current = document(3);
    let state = draftReducer(initialDraftState, {type: "hydrate", document: current});
    state = draftReducer(state, {type: "set-theme", value: "daylight"});
    const late = document(2);
    late.config.appearance.themeKey = "amber";

    const next = draftReducer(state, {type: "saved", document: late, sentConfig: late.config});

    expect(next).toBe(state);
    expect(next.document).toBe(current);
    expect(next.config?.appearance.themeKey).toBe("daylight");
  });

  test("keeps a newer edit made while a save is pending", () => {
    let state = draftReducer(initialDraftState, {type: "hydrate", document: document(0)});
    state = draftReducer(state, {type: "set-theme", value: "amber"});
    const sentConfig = state.config!;
    state = draftReducer(state, {type: "set-theme", value: "daylight"});
    const saved = document(1);
    saved.config.appearance.themeKey = "amber";

    state = draftReducer(state, {type: "saved", document: saved, sentConfig});

    expect(state.document).toBe(saved);
    expect(state.config?.appearance.themeKey).toBe("daylight");
    expect(state.dirty).toBe(true);
    expect(state.conflict).toBe(false);
  });

  test("keeps an edit back to the previous baseline while a save is pending", () => {
    let state = draftReducer(initialDraftState, {type: "hydrate", document: document(0)});
    state = draftReducer(state, {type: "set-theme", value: "amber"});
    const sentConfig = state.config!;
    state = draftReducer(state, {type: "set-theme", value: "midnight"});
    const saved = document(1);
    saved.config.appearance.themeKey = "amber";

    state = draftReducer(state, {type: "saved", document: saved, sentConfig});

    expect(state.document).toBe(saved);
    expect(state.config?.appearance.themeKey).toBe("midnight");
    expect(state.dirty).toBe(true);
    expect(state.conflict).toBe(false);
  });

  test("ignores an older hydrate result for the current device", () => {
    const current = document(3);
    let state = draftReducer(initialDraftState, {type: "hydrate", document: current});
    state = draftReducer(state, {type: "set-theme", value: "amber"});
    const late = document(2);

    const next = draftReducer(state, {type: "hydrate", document: late});

    expect(next).toBe(state);
    expect(next.document).toBe(current);
    expect(next.config?.appearance.themeKey).toBe("amber");
  });
});
