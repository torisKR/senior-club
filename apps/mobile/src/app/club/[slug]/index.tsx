import { useLocalSearchParams } from 'expo-router';

import { ClubDetailScreen } from '@/screens/discovery/club-detail-screen';
import { strictSingleRouteParam } from '@/utils/route-params';

export default function ClubDetailRoute() {
  const { slug } = useLocalSearchParams<{ slug?: string | string[] }>();
  return <ClubDetailScreen slug={strictSingleRouteParam(slug)} />;
}
