import {Box} from "../components/primitives.js";
import type {ConwayLifeViewModel, SnakeCellViewModel} from "../models/view-model.js";

export function ConwayLife({model}: {model: ConwayLifeViewModel}) {
  const width = model.columns * model.cellSize;
  const height = model.rows * model.cellSize;
  return (
    <Box style={{width, height, borderColor: "#12312d", borderWidth: 1, borderRadius: 4, backgroundColor: "#06100f"}}>
      {model.alive.map((cell) => (
        <LifeCell key={`${cell.x}-${cell.y}`} cell={cell} cellSize={model.cellSize} />
      ))}
    </Box>
  );
}

function LifeCell({cell, cellSize}: {cell: SnakeCellViewModel; cellSize: number}) {
  return (
    <Box
      style={{
        x: cell.x * cellSize + 1,
        y: cell.y * cellSize + 1,
        width: Math.max(1, cellSize - 2),
        height: Math.max(1, cellSize - 2),
        borderRadius: 1,
        backgroundColor: "#65cdbd",
        opacity: 0.76,
      }}
    />
  );
}
