'use client';

import { Download, Information, Renew } from '@carbon/icons-react';
import { Button, ProgressBar } from '@carbon/react';
import dynamic from 'next/dynamic';

import { MetricCard } from '@/components/MetricCard';
import { PageHeader } from '@/components/PageHeader';
import { campaigns, heatmap, responseFunnel } from '@/lib/demo-data';

const ResponseTrendChart = dynamic(
  () => import('@/components/ResponseTrendChart').then((module) => module.ResponseTrendChart),
  { ssr: false, loading: () => <div className="skeleton" style={{ height: '280px' }} /> },
);

const analyticsMetrics = [
  {
    label: 'Response rate',
    value: '38.6%',
    change: '+3.4 pts',
    direction: 'up' as const,
    detail: '496 responses',
  },
  {
    label: 'Positive response',
    value: '24.8%',
    change: '+1.9 pts',
    direction: 'up' as const,
    detail: '318 positive',
  },
  {
    label: 'First response',
    value: '9h 42m',
    change: '−1h 16m',
    direction: 'up' as const,
    detail: 'Median: 6h 08m',
  },
  {
    label: 'Follow-up conversion',
    value: '31.2%',
    change: '+4.7 pts',
    direction: 'up' as const,
    detail: 'Accepted windows +6 pts',
  },
];

const channelPerformance = [
  { channel: 'Email', sent: 1052, responses: 427, rate: 40.6, positive: 26.1, median: '8h 54m' },
  { channel: 'Phone', sent: 118, responses: 39, rate: 33.1, positive: 22.0, median: '1d 3h' },
  { channel: 'Meeting', sent: 62, responses: 21, rate: 33.9, positive: 29.0, median: '4h 12m' },
  { channel: 'Social', sent: 52, responses: 9, rate: 17.3, positive: 9.6, median: '2d 6h' },
];

export default function AnalyticsPage() {
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <>
            <Button kind="secondary" onClick={() => window.location.reload()} renderIcon={Renew}>
              Refresh
            </Button>
            <Button disabled renderIcon={Download} title="Report export is planned">
              Export report
            </Button>
          </>
        }
        description="Understand which outreach earns meaningful responses, where follow-up converts, and how the sponsorship pipeline is moving."
        eyebrow="Jun 11 – Jul 10, 2026 · All campaigns"
        title="Analytics"
      />

      <section className="metric-grid metric-grid--compact" aria-label="Analytics summary">
        {analyticsMetrics.map((metric) => (
          <MetricCard {...metric} key={metric.label} />
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="analytics-trend-title">
          <div className="panel__header">
            <div>
              <h2 id="analytics-trend-title">Response and positive-response trend</h2>
              <p>Percentage of delivered outreach, by week</p>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponseTrendChart />
          </div>
          <p className="chart-summary">
            Response performance improved without increasing the seven-day average outreach
            frequency. Recommended-window adoption rose from 41% to 58% over the same period.
          </p>
        </section>
        <section className="panel" aria-labelledby="funnel-analytics-title">
          <div className="panel__header">
            <div>
              <h2 id="funnel-analytics-title">Outreach funnel</h2>
              <p>Recorded outcomes, not modeled projections</p>
            </div>
          </div>
          <div className="funnel-visual">
            {responseFunnel.map((item) => (
              <div
                className="funnel-block"
                key={item.label}
                style={{ width: `${Math.max(item.percent, 18)}%` }}
              >
                <span>{item.label}</span>
                <strong>{item.value.toLocaleString()}</strong>
                <small>{item.percent}% of delivered</small>
              </div>
            ))}
          </div>
          <p className="chart-summary">
            43 contacts reached a committed stage. Human review is required for response
            classification changes that affect this funnel.
          </p>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid--equal">
        <section className="panel" aria-labelledby="analytics-heatmap-title">
          <div className="panel__header">
            <div>
              <h2 id="analytics-heatmap-title">Day-and-hour response heatmap</h2>
              <p>Relative historical signal in recipient-local time</p>
            </div>
            <Information size={18} />
          </div>
          <div
            className="heatmap"
            role="img"
            aria-label="Response heatmap peaks Wednesday at noon with a relative signal of 91."
          >
            <span />
            {['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM'].map((time) => (
              <span className="heatmap__label" key={time}>
                {time}
              </span>
            ))}
            {heatmap.map((row) => (
              <div style={{ display: 'contents' }} key={row.day}>
                <span className="heatmap__label">{row.day}</span>
                {row.values.map((value, index) => (
                  <span
                    className="heatmap__cell"
                    data-peak={value >= 85}
                    key={`${row.day}-${index}`}
                    style={{ '--intensity': value } as React.CSSProperties}
                  >
                    {value}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="chart-summary">
            Aggregate patterns inform sparse-history fallback only. Individual recommendations still
            enforce consent, quiet hours, frequency, timezone, and campaign urgency.
          </p>
        </section>
        <section className="panel" aria-labelledby="campaign-compare-title">
          <div className="panel__header">
            <div>
              <h2 id="campaign-compare-title">Campaign comparison</h2>
              <p>Response and positive-response rate</p>
            </div>
          </div>
          <div className="comparison-list">
            {campaigns.map((campaign) => (
              <div className="comparison-row" key={campaign.id}>
                <div>
                  <strong>{campaign.name}</strong>
                  <span className="mono">{campaign.responseRate}%</span>
                </div>
                <div className="comparison-bars">
                  <span
                    style={{ width: `${campaign.responseRate}%` }}
                    title={`${campaign.responseRate}% response`}
                  />
                  <span
                    style={{ width: `${campaign.positiveRate}%` }}
                    title={`${campaign.positiveRate}% positive`}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="legend-inline">
            <span>
              <i className="legend-response" /> Response
            </span>
            <span>
              <i className="legend-positive" /> Positive
            </span>
          </div>
        </section>
      </div>

      <section className="panel panel--flush table-wrap" aria-labelledby="channel-title">
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="channel-title">Channel performance</h2>
            <p>Delivery volume, outcomes, and median time to first response</p>
          </div>
        </div>
        <table className="faro-table">
          <caption className="visually-hidden">Channel performance metrics</caption>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Outreach sent</th>
              <th>Responses</th>
              <th>Response rate</th>
              <th>Positive rate</th>
              <th>Median response</th>
            </tr>
          </thead>
          <tbody>
            {channelPerformance.map((item) => (
              <tr key={item.channel}>
                <td>
                  <strong>{item.channel}</strong>
                </td>
                <td className="mono">{item.sent.toLocaleString()}</td>
                <td className="mono">{item.responses}</td>
                <td>
                  <ProgressBar
                    hideLabel
                    label={`${item.channel} response rate`}
                    max={60}
                    size="small"
                    value={item.rate}
                  />
                  <span className="table-subtext">{item.rate}%</span>
                </td>
                <td className="mono">{item.positive}%</td>
                <td>{item.median}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
