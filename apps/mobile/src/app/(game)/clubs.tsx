import { useLocalSearchParams, useRouter } from 'expo-router';
import { ParkGolfArcadeScreen } from '@/arcade/park-golf-screen';

export default function ClubsRoute() {
  const { storyChapter } = useLocalSearchParams<{ storyChapter?: string }>();
  const router = useRouter();
  const chapter = typeof storyChapter === 'string' && storyChapter ? storyChapter : undefined;
  return <ParkGolfArcadeScreen key={chapter ?? 'free'} storyChapter={chapter} onLeaveStory={() => router.setParams({ storyChapter: '' })} />;
}
