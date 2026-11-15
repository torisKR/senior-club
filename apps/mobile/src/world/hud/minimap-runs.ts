/** 글자 → 미니맵 색. 같은 색이 이어지면 한 덩어리로 그려 View 수를 줄입니다. */
const COLORS: Record<string, string> = {
  '.': '#5E9C4E', B: '#8A5A2B', '=': '#D9B98A', d: '#E8D3A0', '~': '#3B7BB5', K: '#8A5A2B', S: '#A7ADB2',
  f: '#2F5A33', y: '#C9CE5A', v: '#9C88C9', P: '#1F3F25', C: '#D98FB0', u: '#2A5A2E', o: '#7E8487',
  '*': '#D98FB0', '#': '#8C8C8C', L: '#8C8C8C', F: '#6B4426', b: '#8A5A2B', W: '#7FB3D5', T: '#8A5A2B',
  w: '#8A5A2B', g: '#8A5A2B',
};

export function rowRuns(row: string): { color: string; length: number }[] {
  const runs: { color: string; length: number }[] = [];
  for (const symbol of row) {
    const color = COLORS[symbol] ?? COLORS['.'];
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.length += 1;
    else runs.push({ color, length: 1 });
  }
  return runs;
}
