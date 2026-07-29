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
              Create connected workspace
            </Button>
          }
          description="Bring governed relationship context together, let Faro identify the next action, and keep every draft under human review."
          eyebrow="Faro relationship intelligence"
          title="Turn outreach into a clear next action"
        />
        <InlineNotification
          hideCloseButton
          kind="info"
          lowContrast
          title="Your workspace starts empty"
          subtitle="No fictional contacts or campaigns are mixed into a connected workspace. Google creates a private workspace for the signed-in tester."
        />
        <section className="dashboard-onboarding" aria-labelledby="dashboard-onboarding-title">
          <div className="dashboard-onboarding__intro">
            <p className="eyebrow">One governed decision loop</p>
            <h2 id="dashboard-onboarding-title">Know who needs you next—and why.</h2>
            <p>
              Faro connects relationship context, deterministic timing, and human-reviewed drafting
              so teams can act with clarity without automating the relationship away.
            </p>
          </div>
          <ol className="dashboard-onboarding__steps">
            <li>
              <span>01</span>
              <div>
                <strong>Bring context together</strong>
                <p>Import selected Sheet data and bounded Gmail history into one workspace.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Read the relationship signal</strong>
                <p>See urgency, campaign context, consent, and recipient-local timing together.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Keep the person in control</strong>
                <p>Review IBM Bob drafts and approve separately from any external delivery.</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    );
  const dueOrder = { Overdue: 0, Today: 1, Upcoming: 2, Snoozed: 3, Completed: 4 };
  const openFollowUps = followUps
    .filter((item) => item.dueGroup !== 'Completed')
    .sort((left, right) => dueOrder[left.dueGroup] - dueOrder[right.dueGroup])
    .slice(0, 4);
  const priorityFollowUp =
    openFollowUps.find((item) => item.dueGroup === 'Overdue') ?? openFollowUps[0];

  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <>
            <Button href="/analytics" kind="secondary" renderIcon={SettingsAdjust}>
              Read performance
            </Button>
            <Button href="/follow-ups" renderIcon={ArrowRight}>
              Review follow-ups
            </Button>
          </>
        }
        description="Faro turns relationship context into a next action, then keeps the evidence, timing, and human review close at hand."
        eyebrow="Faro signal · Fictional demo"
        title="Know who needs you next"
      />

      {priorityFollowUp ? (
        <section className="action-brief" aria-labelledby="priority-action-title">
          <div className="action-brief__main">
            <p className="eyebrow">Priority signal · {priorityFollowUp.due}</p>
            <h2 id="priority-action-title">{priorityFollowUp.nextAction}</h2>
            <p>
              {priorityFollowUp.contact} · {priorityFollowUp.organization} ·{' '}
              {priorityFollowUp.reason}
            </p>
          </div>
          <div className="action-brief__context">
            <dl className="action-brief__facts">
              <div>
                <dt>Campaign</dt>
                <dd>{priorityFollowUp.campaign}</dd>
              </div>
              <div>
                <dt>Best window</dt>
                <dd>{priorityFollowUp.recommendedWindow}</dd>
              </div>
              <div>
                <dt>Company · category</dt>
                <dd>
                  {priorityFollowUp.organization} · {priorityFollowUp.industry}
                </dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>
                  {priorityFollowUp.confidence}% · {priorityFollowUp.sufficiency} evidence
                </dd>
              </div>
            </dl>
            <div className="action-brief__rationale">
              <strong>Why Faro surfaced this</strong>
              <p>{priorityFollowUp.explanation}</p>
            </div>
          </div>
          <Button href={`/follow-ups?task=${priorityFollowUp.id}`} renderIcon={ArrowRight}>
            Review this follow-up
          </Button>
        </section>
      ) : null}

      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Decision horizon</p>
          <h2>What needs movement today</h2>
          <p>Work state comes before aggregate performance.</p>
        </div>
      </div>
      <section aria-label="Immediate outreach metrics" className="metric-grid metric-grid--compact">
        {dashboardMetrics.map((metric) => (
          <MetricCard {...metric} key={metric.label} />
        ))}
      </section>

      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Relationship momentum</p>
          <h2>Use the signal to support the decision</h2>
          <p>Response movement and the open queue explain where attention is paying off.</p>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="response-trend-title">
          <div className="panel__header">
            <div>
              <h2 id="response-trend-title">Response momentum</h2>
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
              <h2 id="actions-title">Relationship queue</h2>
              <p>Prioritized by urgency, campaign context, and prior response</p>
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
                    <small>
                      {followUp.organization} · {followUp.industry}
                    </small>
                  </span>
                </div>
                <p>
                  {followUp.campaign} · {followUp.reason}
                </p>
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

      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Timing and value</p>
          <h2>Decide when to act and where momentum sits</h2>
          <p>Aggregate patterns stay secondary to contact-level policy and evidence.</p>
        </div>
      </div>
      <div className="dashboard-grid dashboard-grid--equal">
        <section className="panel" aria-labelledby="heatmap-title">
          <div className="panel__header">
            <div>
              <h2 id="heatmap-title">Best time to reach people</h2>
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
              <h2 id="pipeline-title">Campaign value at a glance</h2>
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

      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Trust and traceability</p>
          <h2>Know where the recommendation came from</h2>
          <p>Recent decisions, source freshness, and drafting boundaries remain visible.</p>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="activity-title">
          <div className="panel__header">
            <div>
              <h2 id="activity-title">Decision trail</h2>
              <p>Auditable changes across relationships, data, and drafts</p>
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
                <h2 id="sync-title">Source freshness</h2>
                <p>Latest governed Google Sheets snapshot</p>
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
                <h2 id="bob-title">Drafting boundary</h2>
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
