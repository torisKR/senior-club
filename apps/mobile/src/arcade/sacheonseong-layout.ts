export const TILE_WIDTH = 50;
export const TILE_HEIGHT = 64;
export const TILE_GAP = 4;
export const TILE_PATH_GUTTER = 18;

type CellPoint = { row: number; col: number };

/** Map the pathfinder's padded border cells to the visible gutter around the grid. */
export function sacheonseongPathSegments(path: readonly CellPoint[], rows: number, cols: number) {
  const x = (col: number) => col < 0 ? TILE_PATH_GUTTER / 2
    : col >= cols ? TILE_PATH_GUTTER + cols * TILE_WIDTH + (cols - 1) * TILE_GAP + TILE_PATH_GUTTER / 2
      : TILE_PATH_GUTTER + col * (TILE_WIDTH + TILE_GAP) + TILE_WIDTH / 2;
  const y = (row: number) => row < 0 ? TILE_PATH_GUTTER / 2
    : row >= rows ? TILE_PATH_GUTTER + rows * TILE_HEIGHT + (rows - 1) * TILE_GAP + TILE_PATH_GUTTER / 2
      : TILE_PATH_GUTTER + row * (TILE_HEIGHT + TILE_GAP) + TILE_HEIGHT / 2;
  return path.slice(1).map((point, index) => {
    const previous = path[index];
    const x1 = x(previous.col), x2 = x(point.col), y1 = y(previous.row), y2 = y(point.row);
    return {
      left: Math.min(x1, x2) - 3,
      top: Math.min(y1, y2) - 3,
      width: Math.abs(x2 - x1) + 6,
      height: Math.abs(y2 - y1) + 6,
    };
  });
}
