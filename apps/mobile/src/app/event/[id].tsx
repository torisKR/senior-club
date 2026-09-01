import { useLocalSearchParams } from 'expo-router';

import { RequireAuth } from '@/components/auth/require-auth';
import { EventDetailScreen } from '@/screens/discovery/event-detail-screen';
import { sanitizeAuthIntent, sanitizeReturnTo } from '@/utils/auth-routing';

export default function EventDetailRoute() {
  const { id, intent } = useLocalSearchParams<{
    id?: string | string[];
    intent?: string | string[];
  }>();

  const eventId = Array.isArray(id) ? id[0] : id;
  const authIntent = sanitizeAuthIntent(intent);
  const screen = (
    <EventDetailScreen
      eventId={eventId}
      intent={authIntent}
    />
  );

  if (authIntent !== 'apply') {
    return screen;
  }

  const returnTo = sanitizeReturnTo(
    eventId ? `/event/${eventId}` : undefined,
    '/events',
  );
  return (
    <RequireAuth intent="apply" loginReturnTo={returnTo}>
      {screen}
    </RequireAuth>
  );
}
