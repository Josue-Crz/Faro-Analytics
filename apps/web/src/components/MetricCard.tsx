import { ArrowDownRight, ArrowUpRight, WarningAlt } from '@carbon/icons-react';

interface MetricCardProps {
  change: string;
  detail: string;
  direction: 'up' | 'down' | 'warn';
  label: string;
  value: string;
}

export function MetricCard({ change, detail, direction, label, value }: MetricCardProps) {
  const Icon =
    direction === 'warn' ? WarningAlt : direction === 'down' ? ArrowDownRight : ArrowUpRight;
  return (
    <article className="metric-card">
      <p className="metric-card__label">{label}</p>
      <p className="metric-card__value">{value}</p>
      <div className={`metric-card__trend metric-card__trend--${direction}`}>
        <Icon aria-hidden size={16} />
        <span>{change}</span>
        <small>{detail}</small>
      </div>
    </article>
  );
}
