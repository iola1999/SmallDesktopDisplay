import {Box} from "../components/primitives.js";
import type {AntColonyViewModel, AntPheromoneViewModel, AntViewModel, SnakeCellViewModel} from "../models/view-model.js";

export function AntColony({model}: {model: AntColonyViewModel}) {
  const width = model.columns * model.cellSize;
  const height = model.rows * model.cellSize;
  return (
    <Box style={{width, height, borderColor: "#12312d", borderWidth: 1, borderRadius: 4, backgroundColor: "#06100f"}}>
      {model.pheromones.map((cell, index) => (
        <Pheromone key={`pheromone-${index}-${cell.x}-${cell.y}`} cell={cell} cellSize={model.cellSize} />
      ))}
      <Nest cell={model.nest} cellSize={model.cellSize} />
      {model.food.map((cell, index) => (
        <Food key={`food-${index}-${cell.x}-${cell.y}`} cell={cell} cellSize={model.cellSize} />
      ))}
      {model.ants.map((ant, index) => (
        <Ant key={`ant-${index}`} ant={ant} cellSize={model.cellSize} />
      ))}
    </Box>
  );
}

function Nest({cell, cellSize}: {cell: SnakeCellViewModel; cellSize: number}) {
  return (
    <Box
      style={{
        x: cell.x * cellSize,
        y: cell.y * cellSize,
        width: cellSize * 2,
        height: cellSize * 2,
        borderRadius: 3,
        backgroundColor: "#24564d",
        opacity: 0.86,
      }}
    />
  );
}

function Food({cell, cellSize}: {cell: SnakeCellViewModel; cellSize: number}) {
  return (
    <Box
      style={{
        x: cell.x * cellSize + 1,
        y: cell.y * cellSize + 1,
        width: Math.max(2, cellSize - 1),
        height: Math.max(2, cellSize - 1),
        borderRadius: 2,
        backgroundColor: "#9af0df",
      }}
    />
  );
}

function Ant({ant, cellSize}: {ant: AntViewModel; cellSize: number}) {
  return (
    <Box
      style={{
        x: ant.x * cellSize + 2,
        y: ant.y * cellSize + 2,
        width: Math.max(2, cellSize - 3),
        height: Math.max(2, cellSize - 3),
        borderRadius: 2,
        backgroundColor: ant.carrying ? "#f4fffb" : "#65cdbd",
        opacity: ant.carrying ? 0.94 : 0.78,
      }}
    />
  );
}

function Pheromone({cell, cellSize}: {cell: AntPheromoneViewModel; cellSize: number}) {
  return (
    <Box
      style={{
        x: cell.x * cellSize + 2,
        y: cell.y * cellSize + 2,
        width: Math.max(1, cellSize - 4),
        height: Math.max(1, cellSize - 4),
        borderRadius: 1,
        backgroundColor: "#2c8a7c",
        opacity: 0.18 + cell.level * 0.35,
      }}
    />
  );
}
