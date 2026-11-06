import Stack from 'expo-router/stack';

export default function ClubStackLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: '서비스 안내' }} />
      <Stack.Screen name="posts" options={{ title: '서비스 안내' }} />
      <Stack.Screen name="post/[id]" options={{ title: '서비스 안내' }} />
    </Stack>
  );
}
