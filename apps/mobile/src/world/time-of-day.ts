type Light = readonly [number, number, number, number];

const NIGHT: Light = [18, 28, 72, 0.27];
const MORNING: Light = [255, 196, 140, 0.10];
const DAY: Light = [255, 196, 140, 0];
const SUNSET: Light = [255, 128, 64, 0.16];
const SCHEDULE: readonly { hour: number; light: Light }[] = [
  { hour: 0, light: NIGHT }, { hour: 5, light: NIGHT }, { hour: 7, light: MORNING },
  { hour: 9, light: DAY }, { hour: 17, light: DAY }, { hour: 19, light: SUNSET },
  { hour: 21, light: NIGHT }, { hour: 24, light: NIGHT },
];

/** 기기 시각에 따른 빛. 시간대 경계에서 색과 농도가 서서히 변합니다. */
export function timeOfDayTint(hour: number): string {
  const time = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 12;
  const index = SCHEDULE.findIndex((entry) => entry.hour > time);
  const from = SCHEDULE[index - 1];
  const to = SCHEDULE[index];
  const progress = (time - from.hour) / (to.hour - from.hour);
  const smooth = progress * progress * (3 - 2 * progress);
  const channels = from.light.map((value, channel) => value + (to.light[channel] - value) * smooth);
  return `rgba(${Math.round(channels[0])}, ${Math.round(channels[1])}, ${Math.round(channels[2])}, ${channels[3].toFixed(3)})`;
}
