/** 한 판 결과 별점(1~3). 판정·보상은 바꾸지 않고, 얼마나 잘했는지 보여 주는 용도입니다. */
export type Stars = 1 | 2 | 3;

/** 파크골프: 버디·홀인원 3개, 파 2개, 그 외 1개. */
export function parkGolfStars({ strokes, par }: { strokes: number; par: number }): Stars {
  if (strokes < par) return 3;
  return strokes === par ? 2 : 1;
}

/** 알까기: 판 위에 남은 내 알 4개 이상 3개, 2개 이상 2개. */
export function alkkagiStars(remainingMine: number): Stars {
  if (remainingMine >= 4) return 3;
  return remainingMine >= 2 ? 2 : 1;
}

/** 사천성: 최고 연속 5 이상 3개, 3 이상 2개. */
export function sacheonseongStars(maxCombo: number): Stars {
  if (maxCombo >= 5) return 3;
  return maxCombo >= 3 ? 2 : 1;
}
