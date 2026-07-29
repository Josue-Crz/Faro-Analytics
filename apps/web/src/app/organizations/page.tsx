'use client';

import { Add, ArrowRight, Search } from '@carbon/icons-react';
import { Button, Pagination } from '@carbon/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { COMPANY_CATEGORIES } from '@faro/core';
import { groupCompaniesByIndustry } from '@/lib/company-categories';
import { organizations } from '@/lib/demo-data';

function organizationStatus(signal: string) {
  if (signal === 'Clear signal' || signal === 'Draft ready') return 'clear';
  if (signal === 'Needs attention') return 'due';
  return 'attention';
}

export default function OrganizationsPage() {
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState('All categories');
  const [stage, setStage] = useState('All stages');
  const [type, setType] = useState('All types');
  const [view, setView] = useState<'list' | 'industry'>('list');
  const visible = useMemo(
    () =>
      organizations.filter((organization) => {
        const matchesQuery =
          `${organization.name} ${organization.industry} ${organization.interest}`
            .toLowerCase()
            .includes(query.toLowerCase());
        return (
          matchesQuery &&
          (industry === 'All categories' || organization.industry === industry) &&
          (stage === 'All stages' || organization.stage === stage) &&
          (type === 'All types' || organization.type === type)
        );
      }),
    [industry, query, stage, type],
  );
  const industryGroups = useMemo(
    () =>
      groupCompaniesByIndustry(
        visible,
        (organization) => organization.industry,
        (organization) => organization.contacts,
      ),
    [visible],
  );

  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button disabled renderIcon={Add} title="Create workflow requires database mode">
            Add organization
          </Button>
        }
        description="Track sponsors, partners, decision makers, pipeline stage, and weighted opportunity value."
        eyebrow="Sponsorship and partnership network"
        title="Organizations"
      />

      <div className="metric-grid metric-grid--compact" aria-label="Organization summary">
        <article className="metric-card">
          <p className="metric-card__label">Active organizations</p>
          <p className="metric-card__value">63</p>
          <p className="table-subtext">24 sponsors · 19 partners</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Open estimated value</p>
          <p className="metric-card__value">$486k</p>
          <p className="table-subtext">$271k weighted</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Decision makers mapped</p>
          <p className="metric-card__value">78%</p>
          <p className="table-subtext">49 of 63 organizations</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Needs attention</p>
          <p className="metric-card__value">7</p>
          <p className="table-subtext">2 negotiation-stage</p>
        </article>
      </div>

      <section aria-labelledby="organization-table-heading">
        <div className="section-heading">
          <div>
            <h2 id="organization-table-heading">Organizations and sponsors</h2>
            <p>Fictional seeded portfolio</p>
          </div>
        </div>
        <div className="filters-bar">
          <div className="filters-bar__group">
            <label className="search-field">
              <span className="visually-hidden">Search organizations</span>
              <Search size={16} />
              <input
                type="search"
                placeholder="Search organization or interest"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              className="filter-select"
              aria-label="Filter by company category"
              onChange={(event) => setIndustry(event.target.value)}
              value={industry}
            >
              <option>All categories</option>
              {COMPANY_CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="filter-select"
              aria-label="Filter pipeline stage"
              onChange={(event) => setStage(event.target.value)}
              value={stage}
            >
              <option>All stages</option>
              <option>Contacted</option>
              <option>Qualified</option>
              <option>Engaged</option>
              <option>Proposal</option>
              <option>Negotiation</option>
              <option>Committed</option>
            </select>
            <select
              className="filter-select"
              aria-label="Filter organization type"
              onChange={(event) => setType(event.target.value)}
              value={type}
            >
              <option>All types</option>
              <option>Sponsor</option>
              <option>Partner</option>
              <option>Donor</option>
            </select>
          </div>
        </div>
        <nav className="queue-tabs" aria-label="Organization views">
          <button
            aria-current={view === 'list' ? 'page' : undefined}
            onClick={() => setView('list')}
            type="button"
          >
            List <span>{visible.length}</span>
          </button>
          <button
            aria-current={view === 'industry' ? 'page' : undefined}
            onClick={() => setView('industry')}
            type="button"
          >
            Group by category <span>{industryGroups.length}</span>
          </button>
        </nav>
        {view === 'list' ? (
          <div className="panel panel--flush">
            <div
              aria-label="Organizations. Scroll within this table to browse results."
              className="table-wrap record-scroll-region"
              role="region"
              tabIndex={0}
            >
              <table className="faro-table">
                <caption className="visually-hidden">
                  Organizations, company categories, pipeline stages, values, contacts, and current
                  signals
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Organization</th>
                    <th scope="col">Pipeline</th>
                    <th scope="col">Estimated value</th>
                    <th scope="col">Interest areas</th>
                    <th scope="col">Contacts</th>
                    <th scope="col">Signal</th>
                    <th scope="col">
                      <span className="visually-hidden">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((organization) => (
                    <tr key={organization.id}>
                      <td>
                        <strong>{organization.name}</strong>
                        <span className="table-subtext">
                          {organization.type} · {organization.industry}
                        </span>
                      </td>
                      <td>{organization.stage}</td>
                      <td>
                        <span className="mono">{organization.value}</span>
                        <span className="table-subtext">{organization.weighted} weighted</span>
                      </td>
                      <td>{organization.interest}</td>
                      <td>{organization.contacts}</td>
                      <td>
                        <span
                          className={`status-badge status-badge--${organizationStatus(organization.signal)}`}
                        >
                          {organization.signal}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/contacts?organization=${organization.id}`}
                          aria-label={`View contacts at ${organization.name}`}
                        >
                          <ArrowRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!visible.length ? (
                    <tr>
                      <td colSpan={7}>No organizations match these filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <Pagination
              backwardText="Previous page"
              forwardText="Next page"
              itemsPerPageText="Organizations per page:"
              page={1}
              pageSize={10}
              pageSizes={[10, 25]}
              totalItems={visible.length}
            />
          </div>
        ) : (
          <div
            aria-label="Organizations grouped by company category. Scroll within this list to browse results."
            className="industry-group-grid record-scroll-region"
            role="region"
            tabIndex={0}
          >
            {industryGroups.map((group) => (
              <section
                className="panel panel--flush industry-group"
                key={group.industry}
                aria-labelledby={`industry-${group.industry.replaceAll(' ', '-').toLowerCase()}`}
              >
                <div className="industry-group__header">
                  <div>
                    <p className="eyebrow">Company category</p>
                    <h3 id={`industry-${group.industry.replaceAll(' ', '-').toLowerCase()}`}>
                      {group.industry}
                    </h3>
                  </div>
                  <p>
                    <strong>{group.companyCount}</strong> companies
                    <span>{group.contactCount} contacts</span>
                  </p>
                </div>
                <ul className="industry-group__list">
                  {group.companies.map((organization) => (
                    <li key={organization.id}>
                      <div>
                        <Link href={`/contacts?organization=${organization.id}`}>
                          {organization.name}
                        </Link>
                        <span>
                          {organization.type} · {organization.stage} · {organization.interest}
                        </span>
                      </div>
                      <span
                        className={`status-badge status-badge--${organizationStatus(organization.signal)}`}
                      >
                        {organization.signal}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!industryGroups.length ? (
              <section className="panel">
                <p>No organizations match these filters.</p>
              </section>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
