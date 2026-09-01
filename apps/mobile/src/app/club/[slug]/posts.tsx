import { useLocalSearchParams } from 'expo-router';

import { PostsScreen } from '@/screens/community/posts-screen';
import { strictSingleRouteParam } from '@/utils/route-params';

export default function ClubPostsRoute() {
  const { slug } = useLocalSearchParams<{ slug?: string | string[] }>();
  return <PostsScreen slug={strictSingleRouteParam(slug)} />;
}
