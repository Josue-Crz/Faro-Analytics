'use client';

import { Add, ArrowRight, Search } from '@carbon/icons-react';
import { Button, Pagination } from '@carbon/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { organizations } from '@/lib/demo-data';

function organizationStatus(signal: string) {
  if (signal === 'Clear signal' || signal === 'Draft ready') return 'clear';
  if (signal === 'Needs attention') return 'due';
  return 'attention';
}

export default function OrganizationsPage() {
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () =>
      organizations.filter((organization) =>
        `${organization.name} ${organization.industry} ${organization.interest}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query],
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
            <select className="filter-select" aria-label="Filter pipeline stage">
              <option>All stages</option>
              <option>Qualified</option>
              <option>Engaged</option>
              <option>Proposal</option>
              <option>Negotiation</option>
              <option>Committed</option>
            </select>
            <select className="filter-select" aria-label="Filter organization type">
              <option>All types</option>
              <option>Sponsor</option>
              <option>Partner</option>
              <option>Donor</option>
            </select>
          </div>
        </div>
        <div className="panel panel--flush table-wrap">
          <table className="faro-table">
            <caption className="visually-hidden">
              Organizations, industries, pipeline stages, values, contacts, and current signals
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
            </tbody>
          </table>
          <Pagination
            backwardText="Previous page"
            forwardText="Next page"
            itemsPerPageText="Organizations per page:"
            page={1}
            pageSize={10}
            pageSizes={[10, 25]}
            totalItems={63}
          />
        </div>
      </section>
    </div>
  );
}
