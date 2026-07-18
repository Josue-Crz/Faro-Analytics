'use client';

import { ArrowRight, Renew, SettingsAdjust } from '@carbon/icons-react';
import { Button, InlineNotification } from '@carbon/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ConnectedDashboard } from '@/components/ConnectedDashboard';
import { MetricCard } from '@/components/MetricCard';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import {
  bobDrafts,
  dashboardMetrics,
  followUps,
  heatmap,
  pipeline,
  recentActivity,
  sheetSyncRuns,
} from '@/lib/demo-data';

const ResponseTrendChart = dynamic(
  () => import('@/components/ResponseTrendChart').then((module) => module.ResponseTrendChart),
  {
    loading: () => (
      <div className="skeleton" style={{ height: '280px' }} aria-label="Loading chart" />
    ),
    ssr: false,
  },
);

const heatmapTimes = ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM'];

export default function DashboardPage() {
  const [workspaceMode, setWorkspaceMode] = useState<'loading' | 'empty' | 'demo' | 'connected'>(
    'loading',
  );
  useEffect(() => {
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result: { authenticated?: boolean; mode?: string }) =>
        setWorkspaceMode(
          result.authenticated ? 'connected' : result.mode === 'FALLBACK' ? 'demo' : 'empty',
        ),
      )
      .catch(() => setWorkspaceMode('empty'));
  }, []);
  if (workspaceMode === 'loading')
    return <div className="skeleton" style={{ height: '20rem' }} aria-label="Loading dashboard" />;
  if (workspaceMode === 'connected') return <ConnectedDashboard />;
  if (workspaceMode === 'empty')
    return (
      <div className="page-shell">
        <PageHeader
          actions={
            <Button href="/api/auth/google/start?returnTo=/integrations/google-sheets">
              Connect Google account
            </Button>
          }
          description="Connect Google to create a private workspace. Contacts, organizations, campaigns, and follow-ups begin empty."
          eyebrow="New workspace"
          title="Welcome to Faro"
        />
        <InlineNotification
          hideCloseButton
          kind="info"
          lowContrast
          title="No fictional records are loaded"
          subtitle="The Jordan Lee preview appears only after an OAuth failure. Successful authentication opens an empty connected workspace."
        />
      </div>
    );
  const openFollowUps = followUps.filter((item) => item.dueGroup !== 'Completed').slice(0, 4);

  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <>
            <Button href="/analytics" kind="secondary" renderIcon={SettingsAdjust}>
              Explore analytics
            </Button>
            <Button href="/follow-ups" renderIcon={ArrowRight}>
              Work follow-ups
            </Button>
          </>
        }
        description="A clear view of response signals, outreach timing, sponsorship momentum, and the work that needs your attention."
        eyebrow="Signal overview · Last 30 days"
        title="Good morning, Jordan"
      />

      <section aria-label="Key outreach metrics" className="metric-grid">
        {dashboardMetrics.map((metric) => (
          <MetricCard {...metric} key={metric.label} />
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="response-trend-title">
          <div className="panel__header">
            <div>
              <h2 id="response-trend-title">Response signal</h2>
              <p>Weekly delivered outreach that received a response</p>
            </div>
            <StatusBadge label="Clear signal" status="clear" />
          </div>
          <div className="chart-wrap">
            <ResponseTrendChart />
          </div>
          <p className="chart-summary">
            Response rate reached 38.6%, up 7.6 points across five weeks. Positive responses rose to
            24.8%; the improvement is broad-based rather than driven by one campaign.
          </p>
        </section>

        <section className="panel panel--flush" aria-labelledby="actions-title">
          <div className="panel__header" style={{ padding: '1.25rem 1.25rem 0' }}>
            <div>
              <h2 id="actions-title">Next best actions</h2>
              <p>Prioritized by urgency, value, and response context</p>
            </div>
            <Link className="section-link" href="/follow-ups">
              View all <ArrowRight size={16} />
            </Link>
          </div>
          {openFollowUps.map((followUp) => (
            <Link
              className="list-card dashboard-action"
              href={`/follow-ups?task=${followUp.id}`}
              key={followUp.id}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <div>
                <div className="contact-cell">
                  <span className="avatar">{followUp.initials}</span>
                  <span>
                    <h3>{followUp.contact}</h3>
                    <small>{followUp.organization}</small>
                  </span>
                </div>
                <p>{followUp.reason}</p>
              </div>
              <div className="list-card__meta">
                <StatusBadge label={followUp.statusLabel} status={followUp.status} />
                <span className="mono" style={{ fontSize: '.6875rem' }}>
                  {followUp.due}
                </span>
              </div>
            </Link>
          ))}
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid--equal">
        <section className="panel" aria-labelledby="heatmap-title">
          <div className="panel__header">
            <div>
              <h2 id="heatmap-title">Recommended outreach windows</h2>
              <p>Smoothed response likelihood by recipient-local time</p>
            </div>
            <StatusBadge label="82% data coverage" status="clear" />
          </div>
          <div
            className="heatmap"
            role="img"
            aria-label="Response likelihood heatmap. Wednesday at noon is the strongest window at 91 percent, followed by Tuesday at noon at 86 percent."
          >
            <span />
            {heatmapTimes.map((time) => (
              <span className="heatmap__label" key={time}>
                {time}
              </span>
            ))}
            {heatmap.map((row) => (
              <div key={row.day} style={{ display: 'contents' }}>
                <span className="heatmap__label">{row.day}</span>
                {row.values.map((value, index) => (
                  <span
                    className="heatmap__cell"
                    data-peak={value >= 85}
                    key={`${row.day}-${heatmapTimes[index]}`}
                    style={{ '--intensity': value } as React.CSSProperties}
                    title={`${row.day} ${heatmapTimes[index]}: ${value}% relative response signal`}
                  >
                    {value}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="chart-summary">
            Best current cohort window: Tuesday–Wednesday, 10 AM–noon local time. Faro always
            applies quiet hours, consent, frequency, and contact-level evidence before using this
            aggregate pattern.
          </p>
        </section>

        <section className="panel" aria-labelledby="pipeline-title">
          <div className="panel__header">
            <div>
              <h2 id="pipeline-title">Sponsorship pipeline</h2>
              <p>Open opportunity count and estimated value</p>
            </div>
            <span className="mono" style={{ fontSize: '.75rem' }}>
              $486k active
            </span>
          </div>
          <div className="pipeline-list">
            {pipeline.map((stage) => (
              <div className="pipeline-row" key={stage.stage}>
                <div className="pipeline-row__meta">
                  <span>{stage.stage}</span>
                  <span>{stage.count}</span>
                  <span>${Math.round(stage.value / 1000)}k</span>
                </div>
                <div className="pipeline-track" aria-hidden="true">
                  <span style={{ width: `${stage.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="chart-summary">
            Seven proposals represent $74k. Two negotiation-stage opportunities need a response
            before Friday.
          </p>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="activity-title">
          <div className="panel__header">
            <div>
              <h2 id="activity-title">Recent activity</h2>
              <p>Auditable changes across outreach, data, and drafts</p>
            </div>
          </div>
          <ol className="timeline">
            {recentActivity.map((activity) => (
              <li key={`${activity.time}-${activity.title}`}>
                <time>{activity.time}</time>
                <span className="timeline__line" aria-hidden="true" />
                <span>
                  <strong>{activity.title}</strong>
                  <small>{activity.detail}</small>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="panel" aria-labelledby="sync-title">
            <div className="panel__header">
              <div>
                <h2 id="sync-title">Google Sheets sync</h2>
                <p>Last governed import</p>
              </div>
              <StatusBadge label="Healthy" status="clear" />
            </div>
            <strong style={{ fontSize: '1.35rem', fontWeight: 400 }}>
              {sheetSyncRuns[0]?.source}
            </strong>
            <p
              style={{ color: 'var(--faro-text-secondary)', fontSize: '.8rem', margin: '.4rem 0' }}
            >
              {sheetSyncRuns[0]?.summary}
            </p>
            <Link className="section-link" href="/integrations/google-sheets">
              Review sync health <ArrowRight size={16} />
            </Link>
          </section>

          <section className="panel panel--dark" aria-labelledby="bob-title">
            <div className="panel__header">
              <div>
                <h2 id="bob-title">IBM Bob workflow</h2>
                <p style={{ color: '#a8a8a8' }}>MCP server available · Runtime unavailable</p>
              </div>
              <Renew aria-hidden style={{ color: 'var(--faro-beam)' }} />
            </div>
            <p style={{ fontSize: '.875rem', lineHeight: 1.5, margin: '0 0 1rem' }}>
              {bobDrafts.filter((draft) => draft.status === 'Awaiting IBM Bob').length} request is
              awaiting IBM Bob. No substitute AI provider will be used.
            </p>
            <Link className="section-link" href="/settings/ai" style={{ color: '#78a9ff' }}>
              Open integration status <ArrowRight size={16} />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
