import {Box, Screen, Text} from "../components/primitives.js";
import type {BrightnessDetailViewModel, DetailRowViewModel, DetailViewModel, RowsDetailViewModel} from "../models/view-model.js";
import {mixColor} from "../services/color.js";

export function DetailPage({model}: {model: DetailViewModel}) {
  if (model.kind === "brightness") return <BrightnessPage model={model} />;
  return <RowsDetailPage model={model} />;
}

function BrightnessPage({model}: {model: BrightnessDetailViewModel}) {
  return (
    <Screen fontKey={model.fontKey} backgroundColor="#070a10">
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#2c3644", borderWidth: 2}} />
      <Text style={{x: 20, y: 18, width: 160, height: 28, fontSize: 22, color: "#edf2f8"}}>{model.title}</Text>
      <Text style={{x: 20, y: 49, width: 180, height: 18, fontSize: 13, color: "#6f87ab"}}>{model.subtitle}</Text>
      <Text style={{x: 0, y: 82 - Math.round(model.pulse * 3), width: 240, height: 52, fontSize: 42, color: mixColor("#f0f4f8", "#bcd8ff", model.pulse * 0.45), alignItems: "center"}}>
        {model.valueLabel}
      </Text>
      <Box style={{x: 34, y: 146, width: 172, height: 18, borderRadius: 9, backgroundColor: "#10151c"}} />
      <Box style={{x: 35, y: 147, width: model.fillWidth, height: 16, borderRadius: 8, backgroundColor: "#6fa8e8"}} />
      <Text style={{x: 34, y: 184, width: 160, height: 22, fontSize: 16, color: "#8fa6c0"}}>{model.appliedLabel}</Text>
      <Text style={{x: 0, y: 210, width: 240, height: 18, fontSize: 13, color: "#93a7c4", alignItems: "center"}}>
        double tap back
      </Text>
    </Screen>
  );
}

function RowsDetailPage({model}: {model: RowsDetailViewModel}) {
  // Theme 详情页用待选主题实时染色，其余详情页保持石墨蓝默认。
  const preview = model.themePreview;
  return (
    <Screen fontKey={model.fontKey} backgroundColor={preview?.background ?? "#070a10"}>
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: preview?.border ?? "#2c3644", borderWidth: 2}} />
      <Text style={{x: 20, y: 18, width: 190, height: 28, fontSize: 22, color: preview?.time ?? "#edf2f8"}}>{model.title}</Text>
      <Text style={{x: 20, y: 49, width: 190, height: 18, fontSize: 13, color: preview?.seconds ?? "#6f87ab"}}>{model.subtitle}</Text>
      {model.rows.map((row, index) => (
        <Row key={row.label} row={row} index={index} valueColor={preview?.date} />
      ))}
      <Text style={{x: 0, y: 210, width: 240, height: 18, fontSize: 13, color: preview?.lunar ?? "#93a7c4", alignItems: "center"}}>
        double tap back
      </Text>
    </Screen>
  );
}

function Row({row, index, valueColor}: {row: DetailRowViewModel; index: number; valueColor?: string}) {
  return (
    <>
      <Box style={{x: 18, y: 80 + index * 28, width: 204, height: 24, borderRadius: 8, backgroundColor: "#10151c"}} />
      <Text style={{x: 28, y: 84 + index * 28, width: 60, height: 18, fontSize: 13, color: "#74879e"}}>{row.label}</Text>
      <Text style={{x: 92, y: 82 + index * 28, width: 128, height: 20, fontSize: 16, color: valueColor ?? "#e2ebf5"}}>{row.value}</Text>
    </>
  );
}
