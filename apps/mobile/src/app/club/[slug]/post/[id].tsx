import { useLocalSearchParams } from 'expo-router';

import { PostDetailScreen } from '@/screens/community/post-detail-screen';
import { strictSingleRouteParam } from '@/utils/route-params';

export default function ClubPostDetailRoute() {
  const { slug, id } = useLocalSearchParams<{
    slug?: string | string[];
    id?: string | string[];
  }>();
  return (
    <PostDetailScreen
      slug={strictSingleRouteParam(slug)}
      postId={strictSingleRouteParam(id)}
    />
  );
}
