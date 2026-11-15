import { useLocalSearchParams, useRouter } from 'expo-router';
import { SacheonseongTileScreen } from '@/arcade/sacheonseong-screen';

export default function ChatRoute() {
  const { storyChapter } = useLocalSearchParams<{ storyChapter?: string }>();
  const router = useRouter();
  const chapter = typeof storyChapter === 'string' && storyChapter ? storyChapter : undefined;
  return <SacheonseongTileScreen key={chapter ?? 'free'} storyChapter={chapter} onLeaveStory={() => router.setParams({ storyChapter: '' })} />;
}
