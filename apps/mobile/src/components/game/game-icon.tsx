import { Image } from 'expo-image';

const SOURCES = {
  acorn: require('../../../assets/game/rpg/pixel/gameui/acorn.png'),
  heart: require('../../../assets/game/rpg/pixel/gameui/heart.png'),
  vitality: require('../../../assets/game/rpg/pixel/gameui/vitality.png'),
  gift: require('../../../assets/game/rpg/pixel/gameui/gift.png'),
  quest: require('../../../assets/game/rpg/pixel/gameui/quest.png'),
  map: require('../../../assets/game/rpg/pixel/gameui/mapicon.png'),
} as const;

export type GameIconName = keyof typeof SOURCES;

/** 이모지 대신 쓰는 마을 픽셀 아이콘. 뜻은 늘 옆 글자로도 전달하므로 장식으로 숨깁니다. */
export function GameIcon({ name, size = 24 }: { name: GameIconName; size?: number }) {
  return <Image source={SOURCES[name]} style={{ width: size, height: size }} contentFit="contain" accessible={false} />;
}
