import { Calendar, CheckmarkFilled, Gift } from '@carbon/icons-react';

import type { SponsorshipPortfolioItem } from '@/lib/sponsorship-portfolio';

import { StatusBadge } from './StatusBadge';

const currency = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

const compactNumber = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const monthYear = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

const fullDate = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

function relationshipStatus(item: SponsorshipPortfolioItem) {
  if (item.relationship.status === 'CASH_CONFIRMED') {
    return {
      label: 'Cash confirmed',
      status: 'clear' as const,
      value: `${currency.format(item.relationship.cashAmountUsd)} cash`,
    };
  }
  if (item.relationship.status === 'IN_KIND_CONFIRMED') {
    return {
      label: 'In-kind confirmed',
      status: 'clear' as const,
      value: `${item.relationship.creditsApproximate ? '≈' : ''}${compactNumber.format(
        item.relationship.credits ?? 0,
      )} credits · $0 cash`,
    };
  }
  return {
    label: 'High interest',
    status: 'attention' as const,
    value: '$0 confirmed',
  };
}

export function SponsorshipPortfolioSnapshot({
  items,
  title = 'Current sponsor position',
}: {
  items: SponsorshipPortfolioItem[];
  title?: string;
}) {
  if (!items.length) return null;
  const confirmedCash = items.reduce((total, item) => total + item.relationship.cashAmountUsd, 0);
  const confirmedCredits = items.reduce(
    (total, item) => total + (item.relationship.credits ?? 0),
    0,
  );
  const highInterest = items.filter((item) => item.relationship.status === 'HIGH_INTEREST').length;

  return (
    <section className="sponsorship-snapshot" aria-labelledby="sponsorship-snapshot-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Sponsorship portfolio · Updated Jul 30, 2026</p>
          <h2 id="sponsorship-snapshot-title">{title}</h2>
          <p>
            Cash, in-kind support, and interest stay separate so commitments are not overstated.
          </p>
        </div>
      </div>

      <div className="metric-grid metric-grid--compact" aria-label="Sponsorship totals">
        <article className="metric-card">
          <p className="metric-card__label">Confirmed cash</p>
          <p className="metric-card__value">{currency.format(confirmedCash)}</p>
          <p className="table-subtext">jolli.ai · monetary sponsorship</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Confirmed in-kind</p>
          <p className="metric-card__value">
            {confirmedCredits ? `≈${compactNumber.format(confirmedCredits)}` : '0'}
          </p>
          <p className="table-subtext">Tavily credits · $0 cash</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">High-interest leads</p>
          <p className="metric-card__value">{highInterest}</p>
          <p className="table-subtext">Meta · not yet a confirmed sponsor</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Recommended planning start</p>
          <p className="metric-card__value">Early Nov</p>
          <p className="table-subtext">Begin Meta talks for 2027</p>
        </article>
      </div>

      <div className="sponsorship-snapshot__cards">
        {items.map((item) => {
          const presentation = relationshipStatus(item);
          return (
            <article className="panel sponsorship-snapshot__card" key={item.id}>
              <div className="panel__header">
                <div>
                  <p className="eyebrow">{item.sponsorshipStage}</p>
                  <h3>{item.name}</h3>
                </div>
                <StatusBadge label={presentation.label} status={presentation.status} />
              </div>
              <p className="sponsorship-snapshot__value">{presentation.value}</p>
              <p>{item.relationship.interestSummary}</p>
              {item.relationship.requestedReconnectAt && item.relationship.recommendedStartAt ? (
                <dl className="sponsorship-snapshot__dates">
                  <div>
                    <dt>Requested loop-back</dt>
                    <dd>
                      <Calendar aria-hidden size={16} />
                      <time dateTime={item.relationship.requestedReconnectAt}>
                        {monthYear.format(new Date(item.relationship.requestedReconnectAt))}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>Faro recommends</dt>
                    <dd>
                      <Calendar aria-hidden size={16} />
                      <time dateTime={item.relationship.recommendedStartAt}>
                        {fullDate.format(new Date(item.relationship.recommendedStartAt))}
                      </time>
                    </dd>
                  </div>
                </dl>
              ) : null}
              <div className="sponsorship-snapshot__action">
                {item.relationship.status === 'IN_KIND_CONFIRMED' ? (
                  <Gift aria-hidden size={18} />
                ) : item.relationship.status === 'HIGH_INTEREST' ? (
                  <Calendar aria-hidden size={18} />
                ) : (
                  <CheckmarkFilled aria-hidden size={18} />
                )}
                <p>
                  <strong>Next action</strong>
                  <span>{item.relationship.nextAction}</span>
                </p>
              </div>
            </article>
          );
        })}
      </div>
      <p className="sponsorship-snapshot__provenance">
        Source: workspace-confirmed update supplied to Faro on Jul 30, 2026. Faro preserves the
        stated status and does not independently verify external commitments.
      </p>
    </section>
  );
}
