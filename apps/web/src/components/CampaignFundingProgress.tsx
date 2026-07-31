import { Money, Renew } from '@carbon/icons-react';

import {
  calculateCampaignFundingProgress,
  type AnnualCampaignFundingPlan,
  type SponsorshipPortfolioItem,
} from '@/lib/sponsorship-portfolio';

import { StatusBadge } from './StatusBadge';

const currency = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

const number = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

export function CampaignFundingProgress({
  campaignName,
  items,
  plan,
}: {
  campaignName?: string;
  items: SponsorshipPortfolioItem[];
  plan: AnnualCampaignFundingPlan;
}) {
  if (!items.length) return null;
  const progress = calculateCampaignFundingProgress(items, plan);
  const displayName = campaignName ?? plan.campaignName;

  return (
    <section className="campaign-funding panel" aria-labelledby="campaign-funding-title">
      <div className="campaign-funding__header">
        <div>
          <p className="eyebrow">Campaign funding · {plan.targetYear} cash sponsorships</p>
          <h2 id="campaign-funding-title">
            {currency.format(progress.confirmedCashUsd)} raised of{' '}
            {currency.format(plan.targetCashUsd)} goal
          </h2>
          <p>{displayName}</p>
        </div>
        <StatusBadge
          label={`${progress.percentFunded.toFixed(1)}% funded`}
          status={progress.percentFunded >= 100 ? 'clear' : 'attention'}
        />
      </div>

      <div className="campaign-funding__progress">
        <progress
          aria-label={`${displayName} cash sponsorship progress`}
          max={plan.targetCashUsd}
          value={progress.confirmedCashUsd}
        >
          {progress.percentFunded.toFixed(1)}%
        </progress>
        <span>{progress.percentFunded.toFixed(1)}%</span>
      </div>

      <dl className="campaign-funding__facts">
        <div>
          <dt>
            <Money aria-hidden size={16} />
            Confirmed cash
          </dt>
          <dd>{currency.format(progress.confirmedCashUsd)}</dd>
        </div>
        <div>
          <dt>Annual target</dt>
          <dd>{currency.format(plan.targetCashUsd)}</dd>
        </div>
        <div>
          <dt>Still to raise</dt>
          <dd>{currency.format(progress.remainingCashUsd)}</dd>
        </div>
        <div>
          <dt>Confirmed in-kind</dt>
          <dd>≈{number.format(progress.confirmedCredits)} credits</dd>
        </div>
      </dl>

      <div className="campaign-funding__method">
        <Renew aria-hidden size={18} />
        <p>
          <strong>How this year’s goal was set</strong>
          <span>
            The {currency.format(plan.targetCashUsd)} target matches the{' '}
            {currency.format(plan.priorSponsorCashUsd)} cash baseline from past sponsors. Tavily’s
            credits and Meta’s high interest remain visible, but neither is counted as money raised.
          </span>
        </p>
      </div>
    </section>
  );
}
