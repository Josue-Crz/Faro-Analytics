import Link from 'next/link';

import { LighthouseMark } from '@/components/LighthouseMark';

export default function NotFound() {
  return (
    <div className="page-shell page-state page-state--centered">
      <LighthouseMark size={56} />
      <p className="eyebrow">404 · Outside the charted area</p>
      <h1>That signal could not be found.</h1>
      <p>The record may have moved, or your workspace may not have permission to view it.</p>
      <Link className="cds--btn cds--btn--primary" href="/dashboard">
        Return to dashboard
      </Link>
    </div>
  );
}
