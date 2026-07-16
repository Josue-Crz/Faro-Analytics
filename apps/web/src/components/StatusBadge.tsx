import { CheckmarkFilled, InformationFilled, Time, WarningAltFilled } from '@carbon/icons-react';

import type { SignalStatus } from '@/lib/demo-data';

const icons = {
  attention: WarningAltFilled,
  awaiting: Time,
  clear: CheckmarkFilled,
  complete: CheckmarkFilled,
  due: WarningAltFilled,
  insufficient: InformationFilled,
  issue: WarningAltFilled,
  ready: CheckmarkFilled,
};

export function StatusBadge({ label, status }: { label: string; status: SignalStatus }) {
  const Icon = icons[status];
  return (
    <span className={`status-badge status-badge--${status}`}>
      <Icon aria-hidden size={14} />
      {label}
    </span>
  );
}
