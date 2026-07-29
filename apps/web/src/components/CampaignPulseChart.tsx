'use client';

import { ArrowRight } from '@carbon/icons-react';
import { Button } from '@carbon/react';
import { useState } from 'react';

export interface CampaignPulseDatum {
  contacts: number;
  followUpsOpen: number;
  href?: string;
  id: string;
  name: string;
  positiveResponseRate: number;
  responseRate: number;
}

type PulseMetric = 'response' | 'positive' | 'followUps';

const metricOptions: Array<{
  description: string;
  label: string;
  metric: PulseMetric;
  prompt: string;
}> = [
  {
    description: 'The share of delivered outreach that received any response.',
    label: 'Replies',
    metric: 'response',
    prompt: 'Which campaign is getting replies?',
  },
  {
    description: 'The share of reviewed responses that show positive intent.',
    label: 'Positive replies',
    metric: 'positive',
    prompt: 'Which campaign is creating interest?',
  },
  {
    description: 'Open tasks that still need a person to review or complete them.',
    label: 'Follow-ups',
    metric: 'followUps',
    prompt: 'Which campaign needs attention?',
  },
];

function metricValue(item: CampaignPulseDatum, metric: PulseMetric) {
  if (metric === 'response') return item.responseRate;
  if (metric === 'positive') return item.positiveResponseRate;
  return item.followUpsOpen;
}

function metricUnit(metric: PulseMetric) {
  return metric === 'followUps' ? '' : '%';
}

export function CampaignPulseChart({
  campaigns,
  onSelectedIdChange,
  selectedId,
}: {
  campaigns: CampaignPulseDatum[];
  onSelectedIdChange?: (id: string) => void;
  selectedId?: string;
}) {
  const [metric, setMetric] = useState<PulseMetric>('followUps');
  const [internalSelectedId, setInternalSelectedId] = useState(campaigns[0]?.id ?? '');
  if (!campaigns.length) return null;

  const activeOption = metricOptions.find((item) => item.metric === metric)!;
  const activeSelectedId = selectedId ?? internalSelectedId;
  const selected = campaigns.find((campaign) => campaign.id === activeSelectedId) ?? campaigns[0]!;
  const sorted = [...campaigns].sort(
    (left, right) => metricValue(right, metric) - metricValue(left, metric),
  );
  const chartMaximum =
    metric === 'followUps'
      ? Math.max(...campaigns.map((campaign) => campaign.followUpsOpen), 1)
      : 100;
  const selectedValue = metricValue(selected, metric);
  const rank = sorted.findIndex((campaign) => campaign.id === selected.id) + 1;
  const unit = metricUnit(metric);

  function selectCampaign(id: string) {
    setInternalSelectedId(id);
    onSelectedIdChange?.(id);
  }

  return (
    <section className="panel campaign-pulse" aria-labelledby="campaign-pulse-title">
      <div className="panel__header campaign-pulse__header">
        <div>
          <p className="eyebrow">Interactive campaign pulse</p>
          <h2 id="campaign-pulse-title">{activeOption.prompt}</h2>
          <p>Choose a question, then select a campaign bar to understand the result.</p>
        </div>
        <div className="campaign-pulse__metric-switcher" aria-label="Choose a comparison metric">
          {metricOptions.map((option) => (
            <button
              aria-pressed={metric === option.metric}
              key={option.metric}
              onClick={() => setMetric(option.metric)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="campaign-pulse__layout">
        <div>
          <div className="campaign-pulse__scale" aria-hidden="true">
            <span>0{unit}</span>
            <span>
              {Math.round(chartMaximum / 2)}
              {unit}
            </span>
            <span>
              {chartMaximum}
              {unit}
            </span>
          </div>
          <div
            className="campaign-pulse__chart"
            data-metric={metric}
            role="group"
            aria-label={`${activeOption.label} by campaign`}
          >
            {sorted.map((campaign) => {
              const value = metricValue(campaign, metric);
              const width = value ? Math.max((value / chartMaximum) * 100, 3) : 0;
              return (
                <button
                  aria-label={`${campaign.name}: ${value}${unit}`}
                  aria-pressed={selected.id === campaign.id}
                  className="campaign-pulse__row"
                  key={campaign.id}
                  onClick={() => selectCampaign(campaign.id)}
                  type="button"
                >
                  <span className="campaign-pulse__label">{campaign.name}</span>
                  <span className="campaign-pulse__track" aria-hidden="true">
                    <span className="campaign-pulse__bar" style={{ width: `${width}%` }} />
                  </span>
                  <strong className="mono">
                    {value}
                    {unit}
                  </strong>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="campaign-pulse__insight" aria-live="polite">
          <p className="eyebrow">Selected campaign</p>
          <h3>{selected.name}</h3>
          <p className="campaign-pulse__value">
            {selectedValue}
            {unit}
          </p>
          <p>
            Ranked #{rank} of {campaigns.length} for {activeOption.label.toLowerCase()}.{' '}
            {activeOption.description}
          </p>
          <dl>
            <div>
              <dt>Audience</dt>
              <dd>{selected.contacts} contacts</dd>
            </div>
            <div>
              <dt>Reply rate</dt>
              <dd>{selected.responseRate}%</dd>
            </div>
            <div>
              <dt>Positive</dt>
              <dd>{selected.positiveResponseRate}%</dd>
            </div>
            <div>
              <dt>Needs action</dt>
              <dd>{selected.followUpsOpen} follow-ups</dd>
            </div>
          </dl>
          <p className="campaign-pulse__tip">
            {metric === 'followUps'
              ? 'Start with overdue work, then handle drafts that already have enough context for review.'
              : metric === 'positive'
                ? 'Use positive replies to learn which message and audience combinations are working.'
                : 'A reply is a signal, not automatically a positive outcome. Check reviewed intent before scaling.'}
          </p>
          {selected.href ? (
            <Button href={selected.href} kind="tertiary" renderIcon={ArrowRight} size="sm">
              Open campaign
            </Button>
          ) : null}
        </aside>
      </div>

      <p className="chart-summary">
        {sorted[0]?.name} currently leads this view at {metricValue(sorted[0]!, metric)}
        {unit}. Select a different question to compare outcomes without changing the source data.
      </p>
    </section>
  );
}
