import {FONT_LABELS, SETTINGS_ITEMS, type DeviceUiState} from "../../ui-state.js";
import {mixColor} from "../color.js";
import {Box, Screen, Text} from "../primitives.js";

export function SettingsPage({state, fontKey, progress}: {state: DeviceUiState; fontKey: string; progress: number}) {
  const pulse = state.animation === "settings_select" ? Math.sin(Math.min(1, progress) * Math.PI) : 0;
  return (
    <Screen fontKey={fontKey} backgroundColor="#06090d">
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#2e3a46", borderWidth: 2}} />
      <Text style={{x: 20, y: 18, width: 120, height: 30, fontSize: 24, color: "#ebf2e8"}}>Settings</Text>
      <Text style={{x: 166, y: 25, width: 58, height: 18, fontSize: 13, color: "#60a0ae"}}>remote</Text>
      {SETTINGS_ITEMS.map((item, index) => {
        const y = 58 + index * 33;
        const selected = index === state.selectedIndex;
        return (
          <Row key={item} item={item} index={index} y={y} selected={selected} pulse={pulse}>
            {item === "Brightness" ? (
              <Text style={{x: 186, y: y + 6, width: 42, height: 18, fontSize: 13, color: "#a5b7be"}}>{`${state.brightness}%`}</Text>
            ) : null}
            {item === "Font" ? (
              <Text style={{x: 174, y: y + 6, width: 50, height: 18, fontSize: 13, color: "#a5b7be"}}>
                {FONT_LABELS[state.fontKey] ?? "Font"}
              </Text>
            ) : null}
          </Row>
        );
      })}
    </Screen>
  );
}

function Row({
  item,
  index,
  y,
  selected,
  pulse,
  children,
}: {
  item: string;
  index: number;
  y: number;
  selected: boolean;
  pulse: number;
  children?: React.ReactNode;
}) {
  return (
    <>
      <Box
        style={{
          x: 16,
          y: y - 2,
          width: 208,
          height: 32,
          borderRadius: 10,
          backgroundColor: selected ? mixColor("#1b6265", "#248b85", pulse * 0.6) : "#11181e",
        }}
      />
      <Text style={{x: 20, y: y + 6, width: 22, height: 18, fontSize: 13, color: selected ? "#0a2a2c" : "#587078", alignItems: "center"}}>{String(index + 1)}</Text>
      <Text style={{x: 54, y: y + 4, width: 116, height: 22, fontSize: 17, color: selected ? "#f4fcf4" : "#a5b7be"}}>
        {item}
      </Text>
      {children}
    </>
  );
}
