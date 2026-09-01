import Stack from 'expo-router/stack';

export default function ClubStackLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: '커뮤니티' }} />
      <Stack.Screen name="posts" options={{ title: '게시판' }} />
      <Stack.Screen name="post/[id]" options={{ title: '게시글' }} />
    </Stack>
  );
}
