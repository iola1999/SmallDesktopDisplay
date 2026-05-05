import {Box} from "../components/primitives.js";
import type {AutoPacmanViewModel, GhostViewModel, PacmanViewModel, SnakeCellViewModel} from "../models/view-model.js";

export function AutoPacman({model}: {model: AutoPacmanViewModel}) {
  const width = model.columns * model.cellSize;
  const height = model.rows * model.cellSize;
  return (
    <Box style={{width, height, borderColor: "#12312d", borderWidth: 1, borderRadius: 4, backgroundColor: "#06100f"}}>
      {model.pellets.map((cell) => (
        <Pellet key={`pellet-${cell.x}-${cell.y}`} cell={cell} cellSize={model.cellSize} />
      ))}
      {model.walls.map((cell) => (
        <Wall key={`wall-${cell.x}-${cell.y}`} cell={cell} cellSize={model.cellSize} />
      ))}
      {model.ghosts.map((ghost, index) => (
        <Ghost key={`ghost-${index}`} ghost={ghost} cellSize={model.cellSize} />
      ))}
      <Pacman model={model.pacman} cellSize={model.cellSize} />
    </Box>
  );
}

function Wall({cell, cellSize}: {cell: SnakeCellViewModel; cellSize: number}) {
  return (
    <Box
      style={{
        x: cell.x * cellSize,
        y: cell.y * cellSize,
        width: cellSize,
        height: cellSize,
        borderRadius: 1,
        backgroundColor: "#17433c",
        opacity: 0.78,
      }}
    />
  );
}

function Pellet({cell, cellSize}: {cell: SnakeCellViewModel; cellSize: number}) {
  return (
    <Box
      style={{
        x: cell.x * cellSize + Math.floor(cellSize / 2) - 1,
        y: cell.y * cellSize + Math.floor(cellSize / 2) - 1,
        width: 2,
        height: 2,
        borderRadius: 1,
        backgroundColor: "#9af0df",
        opacity: 0.72,
      }}
    />
  );
}

function Ghost({ghost, cellSize}: {ghost: GhostViewModel; cellSize: number}) {
  return (
    <Box
      style={{
        x: ghost.x * cellSize + 1,
        y: ghost.y * cellSize + 1,
        width: cellSize - 2,
        height: cellSize - 2,
        borderRadius: 3,
        backgroundColor: ghost.color,
        opacity: 0.82,
      }}
    />
  );
}

function Pacman({model, cellSize}: {model: PacmanViewModel; cellSize: number}) {
  return (
    <Box
      style={{
        x: model.x * cellSize + 1,
        y: model.y * cellSize + 1,
        width: cellSize - 2,
        height: cellSize - 2,
        borderRadius: Math.floor(cellSize / 2),
        backgroundColor: model.mouthOpen ? "#f4ff9d" : "#f1e96f",
      }}
    />
  );
}
