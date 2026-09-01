import { RequireAuth } from '@/components/auth/require-auth';
import { NotificationsScreen } from '@/screens/social/notifications-screen';

export default function NotificationsRoute() {
  return (
    <RequireAuth>
      <NotificationsScreen />
    </RequireAuth>
  );
}
