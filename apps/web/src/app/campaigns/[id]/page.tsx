'use client';

import { ArrowLeft, ArrowRight, Download, Search, UserFollow } from '@carbon/icons-react';
import { Button, ProgressBar } from '@carbon/react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { COMPANY_CATEGORIES } from '@faro/core';
import { campaigns, contacts, followUps, responseFunnel } from '@/lib/demo-data';

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaign = campaigns.find((item) => item.id === params.id);
  if (!campaign) notFound();
  const campaignContacts = contacts.filter((contact) => contact.campaign === campaign.name);
  const campaignTasks = followUps.filter(
    (task) => task.campaign === campaign.name && task.dueGroup !== 'Completed',
  );
  const [industry, setIndustry] = useState('All categories');
  const [query, setQuery] = useState('');
  const visibleCampaignContacts = useMemo(
    () =>
      campaignContacts.filter(
        (contact) =>
          (industry === 'All categories' || contact.industry === industry) &&
          `${contact.name} ${contact.organization} ${contact.industry} ${contact.title}`
            .toLocaleLowerCase('en-US')
            .includes(query.toLocaleLowerCase('en-US')),
      ),
    [campaignContacts, industry, query],
  );

  return (
    <div className="page-shell">
      <Link className="back-link" href="/campaigns">
        <ArrowLeft size={16} /> All campaigns
      </Link>
      <PageHeader
        actions={
          <>
            <Button
              disabled
              kind="secondary"
              renderIcon={Download}
              title="Export workflow is planned"
            >
              Export report
            </Button>
            <Button
              disabled
              renderIcon={UserFollow}
              title="Assignment writes require database mode"
            >
              Assign contacts
            </Button>
          </>
        }
        description={campaign.objective}
        eyebrow={`${campaign.type} · Owned by ${campaign.owner}`}
        title={campaign.name}
      />

      <section className="metric-grid metric-grid--compact" aria-label="Campaign metrics">
        <article className="metric-card">
          <p className="metric-card__label">Campaign contacts</p>
          <p className="metric-card__value">{campaign.contacts}</p>
          <p className="table-subtext">{campaignContacts.length} shown in demo</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Response rate</p>
          <p className="metric-card__value">{campaign.responseRate}%</p>
          <p className="table-subtext">+4.1 pts this month</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Positive response</p>
          <p className="metric-card__value">{campaign.positiveRate}%</p>
          <p className="table-subtext">Human-reviewed outcomes</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Open value</p>
          <p className="metric-card__value">{campaign.value}</p>
          <p className="table-subtext">Deadline {campaign.deadline}</p>
        </article>
      </section>

      <div className="dashboard-grid dashboard-grid--equal">
        <section className="panel" aria-labelledby="funnel-title">
          <div className="panel__header">
            <div>
              <h2 id="funnel-title">Outreach-to-response funnel</h2>
              <p>Campaign conversion from delivered to committed</p>
            </div>
          </div>
          <div className="funnel-list">
            {responseFunnel.map((item) => (
              <div className="funnel-row" key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <strong className="mono">{item.value.toLocaleString()}</strong>
                </div>
                <ProgressBar
                  hideLabel
                  label={item.label}
                  max={100}
                  size="small"
                  value={item.percent}
                />
              </div>
            ))}
          </div>
          <p className="chart-summary">
            Response classifications remain human-reviewable. “Committed” reflects recorded pipeline
            stage, not an AI inference.
          </p>
        </section>
        <section className="panel panel--flush" aria-labelledby="campaign-actions-title">
          <div className="panel__header" style={{ padding: '1.25rem 1.25rem 0' }}>
            <div>
              <h2 id="campaign-actions-title">Follow-up health</h2>
              <p>{campaignTasks.length} priority items in the demo cohort</p>
            </div>
            <Link href="/follow-ups" className="section-link">
              Queue <ArrowRight size={16} />
            </Link>
          </div>
          {campaignTasks.length ? (
            campaignTasks.map((task) => (
              <Link
                className="list-card"
                href={`/follow-ups?task=${task.id}`}
                key={task.id}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <div>
                  <h3>{task.contact}</h3>
                  <p>{task.reason}</p>
                </div>
                <div className="list-card__meta">
                  <StatusBadge label={task.statusLabel} status={task.status} />
                  <span className="mono" style={{ fontSize: '.6875rem' }}>
                    {task.due}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="empty-inline">No open follow-ups in the seeded cohort.</div>
          )}
        </section>
      </div>

      <section className="panel panel--flush table-wrap" aria-labelledby="campaign-contacts-title">
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="campaign-contacts-title">Campaign contacts</h2>
            <p>Stage, latest touch, and next action</p>
          </div>
        </div>
        <div className="filters-bar">
          <div className="filters-bar__group">
            <label className="search-field">
              <span className="visually-hidden">Search campaign contacts</span>
              <Search aria-hidden size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search contact or company"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Filter campaign contacts by company category"
              className="filter-select"
              onChange={(event) => setIndustry(event.target.value)}
              value={industry}
            >
              <option>All categories</option>
              {COMPANY_CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        <table className="faro-table">
          <caption className="visually-hidden">Contacts participating in this campaign</caption>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Organization</th>
              <th>Company category</th>
              <th>Stage</th>
              <th>Last interaction</th>
              <th>Next action</th>
            </tr>
          </thead>
          <tbody>
            {visibleCampaignContacts.map((contact) => (
              <tr key={contact.id}>
                <td>
                  <div className="contact-cell">
                    <span className="avatar">{contact.initials}</span>
                    <Link href={`/contacts/${contact.id}`}>{contact.name}</Link>
                  </div>
                </td>
                <td>{contact.organization}</td>
                <td>{contact.industry}</td>
                <td>{contact.stage}</td>
                <td>{contact.lastInteraction}</td>
                <td>{contact.nextAction}</td>
              </tr>
            ))}
            {!visibleCampaignContacts.length ? (
              <tr>
                <td colSpan={6}>No campaign contacts match this search and category filter.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
