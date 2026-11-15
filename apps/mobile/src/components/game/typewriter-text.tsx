import { useEffect, useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';

import { PixelPalette } from './pixel-theme';

/** 한 글자씩 나오는 간격(ms). 시니어가 읽는 속도보다 약간 빠르게. */
const CHAR_MS = 32;

export interface TypewriterTextProps {
  text: string;
  reduceMotion: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * RPG 대화 줄. 글자가 차례로 나타나고, 누르면 바로 전체가 보입니다.
 * 남은 글자는 투명하게 미리 깔아 두어 줄바꿈·높이가 움직이지 않습니다.
 * 화면 낭독기는 처음부터 전체 문장을 읽습니다.
 */
export function TypewriterText(props: TypewriterTextProps) {
  return <TypewriterLine key={props.text} {...props} />;
}

function TypewriterLine({ text, reduceMotion, style }: TypewriterTextProps) {
  const total = [...text].length;
  const [shown, setShown] = useState(reduceMotion ? total : 0);
  const done = reduceMotion || shown >= total;

  useEffect(() => {
    if (done) return undefined;
    const timer = setInterval(() => setShown((count) => Math.min(total, count + 1)), CHAR_MS);
    return () => clearInterval(timer);
  }, [done, total]);

  const chars = [...text];
  const visible = done ? text : chars.slice(0, shown).join('');
  const hidden = done ? '' : chars.slice(shown).join('');

  return (
    <Pressable
      accessibilityRole="text"
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
      accessibilityHint={done ? undefined : '누르면 대사를 한 번에 봅니다'}
      onPress={() => setShown(total)}>
      <AppText variant="body" style={style}>
        {visible}
        <AppText variant="body" style={[style, styles.hidden]}>{hidden}</AppText>
        {done ? <AppText variant="caption" style={styles.next}>{' ▼'}</AppText> : null}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hidden: { color: 'transparent' },
  next: { color: PixelPalette.gold },
});
