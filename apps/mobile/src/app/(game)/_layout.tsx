import { Stack } from 'expo-router';

import { ArcadeProvider } from '@/arcade/arcade-store';
import { GameHeader } from '@/components/game/game-header';
import { GameSkinProvider } from '@/components/game/game-skin';
import { PixelPalette } from '@/components/game/pixel-theme';
import { RpgProvider } from '@/rpg/rpg-store';
import { RpgStorageGate } from '@/rpg/rpg-storage-gate';

/** 마을(home)은 헤더 없는 풀스크린 월드, 시설·내 집은 그 위에 쌓였다가 ← / 뒤로가기로 마을에 돌아옵니다. */
const PLACE_TITLES = {
  clubs: '파크골프장',
  events: '송학기원 · 알까기',
  chat: '매화다실 · 사천성',
  me: '명인전당',
  house: '내 집',
} as const;

export default function GameLayout() {
  return (
    <GameSkinProvider value>
      <RpgProvider>
        <RpgStorageGate>
          <ArcadeProvider>
            <Stack
              screenOptions={{
                header: (props) => <GameHeader {...props} />,
                contentStyle: { backgroundColor: PixelPalette.hanjiShade },
              }}>
              <Stack.Screen name="home" options={{ headerShown: false }} />
              {Object.entries(PLACE_TITLES).map(([name, title]) => (
                <Stack.Screen key={name} name={name} options={{ title }} />
              ))}
            </Stack>
          </ArcadeProvider>
        </RpgStorageGate>
      </RpgProvider>
    </GameSkinProvider>
  );
}
