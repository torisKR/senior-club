import { isOpen, type PassGrid } from '../movement/motion';

export interface BoundaryEdge {
  x: number;
  y: number;
  length: number;
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
  topWater: boolean;
  bottomWater: boolean;
  leftWater: boolean;
  rightWater: boolean;
}

/** 충돌 격자와 같은 경계를 쓰며, 가로로 이어진 선은 하나의 뷰로 그립니다. */
export function boundaryEdges(grid: PassGrid, cx: number, cy: number, chunkSize: number, isWater: (x: number, y: number) => boolean = () => false): BoundaryEdge[] {
  const edges: BoundaryEdge[] = [];
  const endX = Math.min(grid.width, (cx + 1) * chunkSize);
  const endY = Math.min(grid.height, (cy + 1) * chunkSize);
  for (let y = cy * chunkSize; y < endY; y += 1) {
    for (let x = cx * chunkSize; x < endX; x += 1) {
      if (!isOpen(grid, x, y)) continue;
      const top = !isOpen(grid, x, y - 1);
      const bottom = !isOpen(grid, x, y + 1);
      const left = !isOpen(grid, x - 1, y);
      const right = !isOpen(grid, x + 1, y);
      if (!top && !bottom && !left && !right) continue;
      const topWater = top && isWater(x, y - 1);
      const bottomWater = bottom && isWater(x, y + 1);
      const leftWater = left && isWater(x - 1, y);
      const rightWater = right && isWater(x + 1, y);
      const previous = edges[edges.length - 1];
      if (!left && !right && previous && !previous.left && !previous.right &&
          previous.y === y && previous.x + previous.length === x && previous.top === top && previous.bottom === bottom &&
          previous.topWater === topWater && previous.bottomWater === bottomWater) {
        previous.length += 1;
      } else {
        edges.push({ x, y, length: 1, top, bottom, left, right, topWater, bottomWater, leftWater, rightWater });
      }
    }
  }
  return edges;
}
