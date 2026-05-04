import {FONT_LABELS, SETTINGS_ITEMS, type DeviceUiState} from "../../ui-state.js";
import {mixColor} from "../color.js";
import {nextFontLabel} from "../fonts.js";
import {Box, Screen, Text} from "../primitives.js";

export function DetailPage({state, deviceId, fontKey, progress}: {state: DeviceUiState; deviceId: string; fontKey: string; progress: number}) {
  const item = SETTINGS_ITEMS[state.detailIndex % SETTINGS_ITEMS.length];
  if (item === "Brightness") return <BrightnessPage state={state} fontKey={fontKey} progress={progress} />;
  if (item === "Device") {
    return (
      <RowsDetailPage
        title="Device"
        subtitle="client diagnostics"
        rows={[
          ["Heap", state.diagnostics.heapFree ? formatKb(state.diagnostics.heapFree) : "waiting"],
          ["Block", state.diagnostics.heapMaxBlock ? formatKb(state.diagnostics.heapMaxBlock) : "waiting"],
          ["Frag", state.diagnostics.heapFragmentation ? `${state.diagnostics.heapFragmentation}%` : "waiting"],
          ["RSSI", state.diagnostics.wifiRssi ? `${state.diagnostics.wifiRssi} dBm` : "waiting"],
        ]}
        fontKey={fontKey}
      />
    );
  }
  if (item === "Renderer") {
    return <RowsDetailPage title="Renderer" subtitle="remote frame link" rows={[["Mode", "HTTP keep-alive"], ["Poll", "50 ms"], ["Wait", "10 ms"], ["Frames", "SDD1 diff"]]} fontKey={fontKey} />;
  }
  if (item === "About") {
    return <RowsDetailPage title="About" subtitle="SmallDesktopDisplay" rows={[["Device", deviceId.slice(0, 14)], ["UI", "react-render"], ["Build", "node"], ["Protocol", "SDD1"]]} fontKey={fontKey} />;
  }
  if (item === "Font") {
    return <RowsDetailPage title="Font" subtitle="short apply" rows={[["Current", FONT_LABELS[state.fontKey] ?? "Font"], ["Next", FONT_LABELS[nextFontLabel(state.fontKey)] ?? "Font"], ["Engine", "React"], ["Layout", "Yoga"]]} fontKey={fontKey} />;
  }
  return <RowsDetailPage title={item} subtitle="Setting detail" rows={[["Preview", "only"], ["More", "controls next"]]} fontKey={fontKey} />;
}

function BrightnessPage({state, fontKey, progress}: {state: DeviceUiState; fontKey: string; progress: number}) {
  const value = Math.max(0, Math.min(100, state.pendingBrightness));
  const pulse = ["brightness_adjust", "brightness_applied"].includes(state.animation) ? Math.sin(Math.min(1, progress) * Math.PI) : 0;
  const fillWidth = Math.round(170 * (value / 100));
  return (
    <Screen fontKey={fontKey} backgroundColor="#05080a">
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#323e48", borderWidth: 2}} />
      <Text style={{x: 20, y: 18, width: 160, height: 28, fontSize: 22, color: "#eef6ec"}}>Brightness</Text>
      <Text style={{x: 20, y: 49, width: 180, height: 18, fontSize: 13, color: "#649baa"}}>short apply</Text>
      <Text style={{x: 0, y: 82 - Math.round(pulse * 3), width: 240, height: 52, fontSize: 42, color: mixColor("#f0f8ee", "#b2ffe2", pulse * 0.45), alignItems: "center"}}>
        {`${value}%`}
      </Text>
      <Box style={{x: 34, y: 146, width: 172, height: 18, borderRadius: 9, backgroundColor: "#111b20"}} />
      <Box style={{x: 35, y: 147, width: fillWidth, height: 16, borderRadius: 8, backgroundColor: "#70e0c4"}} />
      <Text style={{x: 34, y: 184, width: 160, height: 22, fontSize: 16, color: "#8eb2b4"}}>
        {state.brightness === state.pendingBrightness ? "applied" : `saved ${state.brightness}%`}
      </Text>
      <Text style={{x: 0, y: 210, width: 240, height: 18, fontSize: 13, color: "#a0bec2", alignItems: "center"}}>
        double tap back
      </Text>
    </Screen>
  );
}

function RowsDetailPage({title, subtitle, rows, fontKey}: {title: string; subtitle: string; rows: Array<[string, string]>; fontKey: string}) {
  return (
    <Screen fontKey={fontKey} backgroundColor="#05080a">
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#323e48", borderWidth: 2}} />
      <Text style={{x: 20, y: 18, width: 190, height: 28, fontSize: 22, color: "#eef6ec"}}>{title}</Text>
      <Text style={{x: 20, y: 49, width: 190, height: 18, fontSize: 13, color: "#649baa"}}>{subtitle}</Text>
      {rows.map(([label, value], index) => (
        <Row key={label} label={label} value={value} index={index} />
      ))}
      <Text style={{x: 0, y: 210, width: 240, height: 18, fontSize: 13, color: "#a0bec2", alignItems: "center"}}>
        double tap back
      </Text>
    </Screen>
  );
}

function Row({label, value, index}: {label: string; value: string; index: number}) {
  return (
    <>
      <Box style={{x: 18, y: 80 + index * 28, width: 204, height: 24, borderRadius: 8, backgroundColor: "#11181e"}} />
      <Text style={{x: 28, y: 84 + index * 28, width: 60, height: 18, fontSize: 13, color: "#70969e"}}>{label}</Text>
      <Text style={{x: 92, y: 82 + index * 28, width: 128, height: 20, fontSize: 16, color: "#e0f0e8"}}>{value}</Text>
    </>
  );
}

function formatKb(value: number): string {
  return `${Math.round(value / 1024)} KB`;
}
