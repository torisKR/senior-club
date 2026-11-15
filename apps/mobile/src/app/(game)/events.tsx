import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlkkagiBoardScreen } from '@/arcade/alkkagi-screen';

export default function EventsRoute() {
  const { storyChapter } = useLocalSearchParams<{ storyChapter?: string }>();
  const router = useRouter();
  const chapter = typeof storyChapter === 'string' && storyChapter ? storyChapter : undefined;
  return <AlkkagiBoardScreen key={chapter ?? 'free'} storyChapter={chapter} onLeaveStory={() => router.setParams({ storyChapter: '' })} />;
}
