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

    state = draftReducer(state, {type: "saved", document: late});

    expect(state.document).toBe(current);
  });
});
