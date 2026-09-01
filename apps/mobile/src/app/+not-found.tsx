import { Link, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Colors, FontWeights } from '@/constants/theme';

const palette = Colors.light;

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '페이지를 찾을 수 없어요' }} />
      <View style={{ flex: 1, justifyContent: 'center', gap: 20, padding: 24, backgroundColor: palette.background }}>
        <Text selectable style={{ color: palette.text, fontSize: 26, fontFamily: FontWeights.strong }}>
          길을 잠시 잃었어요
        </Text>
        <Text selectable style={{ color: palette.textSecondary, fontSize: 18, lineHeight: 29 }}>
          요청한 화면이 없거나 이동되었어요. 홈으로 돌아가 다시 찾아보세요.
        </Text>
        <Link href="/home" asChild>
          <Pressable
            accessibilityRole="button"
            style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: palette.primary }}>
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontFamily: FontWeights.strong }}>홈으로 돌아가기</Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}
