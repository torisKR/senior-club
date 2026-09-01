import { RequireAuth } from '@/components/auth/require-auth';
import { ReviewScreen } from '@/screens/social/review-screen';

export default function NewReviewRoute() {
  return (
    <RequireAuth>
      <ReviewScreen />
    </RequireAuth>
  );
}
