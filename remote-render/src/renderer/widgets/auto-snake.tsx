import {Box} from "../components/primitives.js";
import type {AutoSnakeViewModel, SnakeCellViewModel} from "../models/view-model.js";

export function AutoSnake({model}: {model: AutoSnakeViewModel}) {
  const width = model.columns * model.cellSize;
  const height = model.rows * model.cellSize;
  return (
    <Box style={{width, height, borderColor: "#12312d", borderWidth: 1, borderRadius: 4, backgroundColor: "#06100f"}}>
      {model.body.map((cell, index) => (
        <SnakeCell
          key={`snake-${index}`}
          cell={cell}
          cellSize={model.cellSize}
          color={index === 0 ? "#b8fff1" : index < 3 ? "#78dfca" : "#2f8f7e"}
          opacity={index === 0 ? 1 : Math.max(0.42, 0.92 - index * 0.08)}
        />
      ))}
      <SnakeCell cell={model.food} cellSize={model.cellSize} color="#f0f8ee" opacity={0.9} inset={2} />
    </Box>
  );
}

function SnakeCell({
  cell,
  cellSize,
  color,
  opacity,
  inset = 1,
}: {
  cell: SnakeCellViewModel;
  cellSize: number;
  color: string;
  opacity: number;
  inset?: number;
}) {
  return (
    <Box
      style={{
        x: cell.x * cellSize + inset,
        y: cell.y * cellSize + inset,
        width: Math.max(1, cellSize - inset * 2),
        height: Math.max(1, cellSize - inset * 2),
        borderRadius: 2,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}
