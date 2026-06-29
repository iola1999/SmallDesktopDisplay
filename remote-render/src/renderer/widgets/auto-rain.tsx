import {Box} from "../components/primitives.js";
import type {AutoRainViewModel, RainCellViewModel} from "../models/view-model.js";

export function AutoRain({model}: {model: AutoRainViewModel}) {
  const width = model.columns * model.cellSize;
  const height = model.rows * model.cellSize;
  return (
    <Box style={{width, height, borderColor: "#0d2b1c", borderWidth: 1, borderRadius: 4, backgroundColor: "#03100a"}}>
      {model.cells.map((cell) => (
        <RainCell key={`${cell.x}-${cell.y}`} cell={cell} cellSize={model.cellSize} />
      ))}
    </Box>
  );
}

function RainCell({cell, cellSize}: {cell: RainCellViewModel; cellSize: number}) {
  return (
    <Box
      style={{
        x: cell.x * cellSize + 1,
        y: cell.y * cellSize + 1,
        width: Math.max(1, cellSize - 2),
        height: Math.max(1, cellSize - 2),
        borderRadius: 1,
        backgroundColor: cell.level >= 1 ? "#d6ffe6" : "#39e08a",
        opacity: cell.level,
      }}
    />
  );
}
