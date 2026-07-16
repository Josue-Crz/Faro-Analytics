'use client';

import { Button, InlineNotification } from '@carbon/react';
import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Faro route error', error);
  }, [error]);

  return (
    <div className="page-shell page-state">
      <InlineNotification
        kind="error"
        lowContrast
        title="We lost the signal"
        subtitle="Faro could not load this view. Your data was not changed."
        hideCloseButton
      />
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
