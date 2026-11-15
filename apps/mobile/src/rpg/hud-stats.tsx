import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText } from '@/components/ui';

import { hud } from './village-hud-styles';

const ICONS = {
  vitality: require('../../assets/game/rpg/pixel/gameui/vitality.png'),
  acorn: require('../../assets/game/rpg/pixel/gameui/acorn.png'),
  heart: require('../../assets/game/rpg/pixel/gameui/heart.png'),
} as const;

interface HudStatsProps {
  vitality: number;
  acorns: number;
  warmth: number;
}

/** 상태 패널 숫자줄: 픽셀 아이콘 + 숫자. 뜻은 아이콘만으로 전달하지 않도록 접근성 이름은 상위 패널이 말합니다. */
export function HudStats({ vitality, acorns, warmth }: HudStatsProps) {
  return (
    <View style={hud.statRow}>
      <Stat icon={ICONS.vitality} text={`활력 ${vitality}`} />
      <Stat icon={ICONS.acorn} text={`${acorns}`} />
      <Stat icon={ICONS.heart} text={`${warmth}°`} />
    </View>
  );
}

function Stat({ icon, text }: { icon: number; text: string }) {
  return (
    <View style={hud.stat}>
      <Image source={icon} style={hud.statIcon} contentFit="contain" accessible={false} />
      <AppText variant="caption" style={hud.statusText}>{text}</AppText>
    </View>
  );
}
