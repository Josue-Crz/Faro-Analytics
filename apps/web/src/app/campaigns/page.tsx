'use client';

import { Add, ArrowRight, Calendar, Search } from '@carbon/icons-react';
import { Button, ProgressBar } from '@carbon/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { COMPANY_CATEGORIES } from '@faro/core';
import { campaigns, contacts } from '@/lib/demo-data';

export default function CampaignsPage() {
  const [industry, setIndustry] = useState('All categories');
  const [query, setQuery] = useState('');
  const visibleCampaigns = useMemo(
    () =>
      campaigns.filter((campaign) => {
        const campaignIndustries = contacts
          .filter((contact) => contact.campaign === campaign.name)
          .map((contact) => contact.industry);
        return (
          `${campaign.name} ${campaign.objective} ${campaign.owner}`
            .toLocaleLowerCase('en-US')
            .includes(query.toLocaleLowerCase('en-US')) &&
          (industry === 'All categories' || campaignIndustries.includes(industry))
        );
      }),
    [industry, query],
  );
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button disabled renderIcon={Add} title="Create workflow requires database mode">
            Create campaign
          </Button>
        }
        description="Align outreach goals, owners, participant cohorts, follow-up health, and measurable response outcomes."
        eyebrow="Coordinated outreach"
        title="Campaigns"
      />

      <div className="filters-bar" aria-label="Campaign search filters">
        <div className="filters-bar__group">
          <label className="search-field">
            <span className="visually-hidden">Search campaigns</span>
            <Search aria-hidden size={16} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search campaign, objective, or owner"
              type="search"
              value={query}
            />
          </label>
          <select
            aria-label="Filter campaigns by contact company category"
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

      <div className="campaign-grid">
        {visibleCampaigns.map((campaign) => (
          <article className="campaign-card" key={campaign.id}>
            <div className="campaign-card__topline">
              <span className="faro-tag">{campaign.type}</span>
              <span
                className={`status-badge status-badge--${campaign.status === 'On track' ? 'clear' : 'attention'}`}
              >
                {campaign.status}
              </span>
            </div>
            <div className="campaign-card__body">
              <h2>
                <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
              </h2>
              <p>{campaign.objective}</p>
              <div className="campaign-owner">
                <span className="avatar">
                  {campaign.owner
                    .split(' ')
                    .map((part) => part[0])
                    .join('')}
                </span>
                <span>
                  <small>Owner</small>
                  {campaign.owner}
                </span>
              </div>
              <dl className="campaign-metrics">
                <div>
                  <dt>Contacts</dt>
                  <dd>{campaign.contacts}</dd>
                </div>
                <div>
                  <dt>Response</dt>
                  <dd>{campaign.responseRate}%</dd>
                </div>
                <div>
                  <dt>Positive</dt>
                  <dd>{campaign.positiveRate}%</dd>
                </div>
                <div>
                  <dt>Follow-ups</dt>
                  <dd className={campaign.due > 5 ? 'text-danger' : ''}>{campaign.due}</dd>
                </div>
              </dl>
              <ProgressBar
                hideLabel
                label={`${campaign.name} positive response rate`}
                max={60}
                size="small"
                value={campaign.positiveRate}
              />
            </div>
            <footer className="campaign-card__footer">
              <span>
                <Calendar size={16} /> Deadline {campaign.deadline}
              </span>
              <span className="mono">{campaign.value}</span>
              <Link href={`/campaigns/${campaign.id}`} aria-label={`Open ${campaign.name}`}>
                <ArrowRight size={18} />
              </Link>
            </footer>
          </article>
        ))}
        {!visibleCampaigns.length ? (
          <div className="panel empty-state">
            <Search size={40} />
            <h2>No campaigns match</h2>
            <p>Try another campaign search or company category.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
