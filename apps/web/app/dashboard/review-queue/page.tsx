// =============================================================================
// HSI Post-V1 — back-compat redirect. The canonical Review Queue lives at
// /dashboard/review (the real Phase-6 human-review hub). This route used to render
// a static mock with a dead "Claim next item" button; it now permanently
// redirects to the real queue so old links and the sidebar never land on a
// placeholder.
// =============================================================================

import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/navigation/routes';

export default function ReviewQueueRedirect() {
  redirect(ROUTES.reviewQueue);
}
