import type {ReactNode} from "react";

import {Box, Screen, Text} from "../components/primitives.js";
import type {SettingsRowViewModel, SettingsViewModel} from "../models/view-model.js";
import {mixColor} from "../services/color.js";

export function SettingsPage({model}: {model: SettingsViewModel}) {
  // 行距随条目数自适应：<=5 项保持原布局，更多项时收紧以始终容纳在卡片内。
  const count = model.rows.length;
  const spacing = count <= 5 ? 33 : Math.floor(170 / count);
  const top = count <= 5 ? 58 : 50;
  const rowHeight = count <= 5 ? 32 : spacing - 3;
  return (
    <Screen fontKey={model.fontKey} backgroundColor="#06090d">
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#2e3a46", borderWidth: 2}} />
      <Text style={{x: 20, y: 18, width: 120, height: 30, fontSize: 24, color: "#ebf2e8"}}>Settings</Text>
      <Text style={{x: 166, y: 25, width: 58, height: 18, fontSize: 13, color: "#60a0ae"}}>remote</Text>
      {model.rows.map((row, index) => (
        <Row key={row.key} row={row} y={top + index * spacing} height={rowHeight} pulse={model.pulse} />
      ))}
    </Screen>
  );
}

function Row({row, y, height, pulse}: {row: SettingsRowViewModel; y: number; height: number; pulse: number}) {
  return (
    <>
      <Box
        style={{
          x: 16,
          y: y - 2,
          width: 208,
          height,
          borderRadius: 10,
          backgroundColor: row.selected ? mixColor("#1b6265", "#248b85", pulse * 0.6) : "#11181e",
        }}
      />
      <Text style={{x: 20, y: y + 6, width: 22, height: 18, fontSize: 13, color: row.selected ? "#0a2a2c" : "#587078", alignItems: "center"}}>
        {row.indexLabel}
      </Text>
      <Text style={{x: 54, y: y + 4, width: 116, height: 22, fontSize: 17, color: row.selected ? "#f4fcf4" : "#a5b7be"}}>
        {row.label}
      </Text>
      <ValueText row={row} y={y} />
    </>
  );
}

function ValueText({row, y}: {row: SettingsRowViewModel; y: number}): ReactNode {
  if (!row.value) return null;
  return (
    <Text style={{x: row.valueX ?? 174, y: y + 6, width: row.valueWidth ?? 50, height: 18, fontSize: 13, color: "#a5b7be"}}>
      {row.value}
    </Text>
  );
}
