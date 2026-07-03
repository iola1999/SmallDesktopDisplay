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
  const selectedIndex = Math.max(0, model.rows.findIndex((row) => row.selected));
  // 高亮条从上一行滑到当前行（进度已缓动）；到位后 pulse 再给一次轻微提亮。
  const fromY = top + model.highlightFromIndex * spacing;
  const toY = top + selectedIndex * spacing;
  const highlightY = Math.round(fromY + (toY - fromY) * model.highlightProgress);
  return (
    <Screen fontKey={model.fontKey} backgroundColor="#070a10">
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#2c3644", borderWidth: 2}} />
      <Text style={{x: 20, y: 18, width: 120, height: 30, fontSize: 24, color: "#edf2f8"}}>Settings</Text>
      <Text style={{x: 166, y: 25, width: 58, height: 18, fontSize: 13, color: "#6f87ab"}}>remote</Text>
      {model.rows.map((row, index) => (
        <Box key={row.key} style={{x: 16, y: top + index * spacing - 2, width: 208, height: rowHeight, borderRadius: 10, backgroundColor: "#10151c"}} />
      ))}
      <Box
        style={{
          x: 16,
          y: highlightY - 2,
          width: 208,
          height: rowHeight,
          borderRadius: 10,
          backgroundColor: mixColor("#24406b", "#2e548f", model.pulse * 0.6),
        }}
      />
      {model.rows.map((row, index) => (
        <RowText key={row.key} row={row} y={top + index * spacing} />
      ))}
    </Screen>
  );
}

function RowText({row, y}: {row: SettingsRowViewModel; y: number}) {
  return (
    <>
      <Text style={{x: 20, y: y + 6, width: 22, height: 18, fontSize: 13, color: row.selected ? "#a9c4ea" : "#5c6b7d", alignItems: "center"}}>
        {row.indexLabel}
      </Text>
      <Text style={{x: 54, y: y + 4, width: 116, height: 22, fontSize: 17, color: row.selected ? "#f2f6fb" : "#9fadbd"}}>
        {row.label}
      </Text>
      <ValueText row={row} y={y} />
    </>
  );
}

function ValueText({row, y}: {row: SettingsRowViewModel; y: number}): ReactNode {
  if (!row.value) return null;
  return (
    <Text style={{x: row.valueX ?? 174, y: y + 6, width: row.valueWidth ?? 50, height: 18, fontSize: 13, color: row.selected ? "#d7e4f5" : "#9fadbd"}}>
      {row.value}
    </Text>
  );
}
