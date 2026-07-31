'use client';

import { Add, Download, Search, Upload } from '@carbon/icons-react';
import { Button, Checkbox, Pagination } from '@carbon/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { COMPANY_CATEGORIES } from '@faro/core';
import { contacts } from '@/lib/demo-data';

export default function ContactsPage() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('All types');
  const [campaign, setCampaign] = useState('All campaigns');
  const [industry, setIndustry] = useState('All categories');
  const [source, setSource] = useState('All sources');
  const [view, setView] = useState<'all' | 'imported'>('all');
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(
    () =>
      contacts.filter((contact) => {
        const matchesQuery =
          `${contact.name} ${contact.organization} ${contact.email} ${contact.industry}`
            .toLowerCase()
            .includes(query.toLowerCase());
        const matchesType = type === 'All types' || contact.type === type;
        const matchesCampaign = campaign === 'All campaigns' || contact.campaign === campaign;
        const matchesIndustry = industry === 'All categories' || contact.industry === industry;
        const matchesSource = source === 'All sources' || contact.source === source;
        const matchesView = view === 'all' || contact.source === 'Google Sheets';
        return (
          matchesQuery &&
          matchesType &&
          matchesCampaign &&
          matchesIndustry &&
          matchesSource &&
          matchesView
        );
      }),
    [campaign, industry, query, source, type, view],
  );

  function toggleSelection(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <>
            <Button
              disabled
              kind="tertiary"
              renderIcon={Download}
              size="md"
              title="Export workflow is planned"
            >
              Export
            </Button>
            <Button
              href="/integrations/google-sheets"
              kind="secondary"
              renderIcon={Upload}
              size="md"
            >
              Import
            </Button>
            <Button
              disabled
              renderIcon={Add}
              size="md"
              title="Create workflow requires database mode"
            >
              Add contact
            </Button>
          </>
        }
        description="Organize participants, sponsors, partners, and their consent-aware outreach history."
        eyebrow="People and relationships"
        title="Contacts"
      />

      <nav className="queue-tabs" aria-label="Contact views">
        <button
          aria-current={view === 'all' ? 'page' : undefined}
          onClick={() => setView('all')}
          type="button"
        >
          All contacts <span>{contacts.length}</span>
        </button>
        <button
          aria-current={view === 'imported' ? 'page' : undefined}
          onClick={() => setView('imported')}
          type="button"
        >
          Recently imported{' '}
          <span>{contacts.filter((contact) => contact.source === 'Google Sheets').length}</span>
        </button>
      </nav>

      <section aria-labelledby="contact-table-heading">
        <div className="section-heading">
          <div>
            <h2 id="contact-table-heading">Workspace contacts</h2>
            <p>{filtered.length} shown · 248 total in Northstar Programs</p>
          </div>
          {selected.length > 0 ? (
            <div className="page-actions">
              <span className="mono" style={{ fontSize: '.75rem' }}>
                {selected.length} selected
              </span>
              <Button disabled kind="ghost" size="sm" title="Bulk writes require database mode">
                Add tags
              </Button>
              <Button disabled kind="ghost" size="sm" title="Bulk writes require database mode">
                Assign campaign
              </Button>
            </div>
          ) : null}
        </div>

        <div className="filters-bar">
          <div className="filters-bar__group">
            <label className="search-field">
              <span className="visually-hidden">Search contacts</span>
              <Search aria-hidden size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, company, or email"
                type="search"
                value={query}
              />
            </label>
            <label>
              <span className="visually-hidden">Filter by contact type</span>
              <select
                className="filter-select"
                onChange={(event) => setType(event.target.value)}
                value={type}
              >
                <option>All types</option>
                <option>Sponsor</option>
                <option>Partner</option>
                <option>Participant</option>
                <option>Speaker</option>
                <option>Donor</option>
              </select>
            </label>
            <label>
              <span className="visually-hidden">Filter by company category</span>
              <select
                className="filter-select"
                onChange={(event) => setIndustry(event.target.value)}
                value={industry}
              >
                <option>All categories</option>
                {COMPANY_CATEGORIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="visually-hidden">Filter by campaign</span>
              <select
                className="filter-select"
                onChange={(event) => setCampaign(event.target.value)}
                value={campaign}
              >
                <option>All campaigns</option>
                <option>Harbor Summit 2026</option>
                <option>Community Data Collaborative</option>
                <option>Youth Navigation Fund</option>
              </select>
            </label>
            <label>
              <span className="visually-hidden">Filter by source</span>
              <select
                className="filter-select"
                onChange={(event) => setSource(event.target.value)}
                value={source}
              >
                <option>All sources</option>
                <option>Google Sheets</option>
                <option>Manual</option>
                <option>Referral</option>
              </select>
            </label>
          </div>
        </div>

        {filtered.length ? (
          <div className="panel panel--flush">
            <div
              aria-label="Contacts. Scroll within this table to browse results."
              className="table-wrap record-scroll-region"
              role="region"
              tabIndex={0}
            >
              <table className="faro-table">
                <caption className="visually-hidden">
                  Contacts with type, campaign, stage, latest interaction, response rate, and
                  consent status
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="visually-hidden">Select</span>
                    </th>
                    <th scope="col">Contact</th>
                    <th scope="col">Type</th>
                    <th scope="col">Campaign / stage</th>
                    <th scope="col">Last interaction</th>
                    <th scope="col">Next scheduled action</th>
                    <th scope="col">Response signal</th>
                    <th scope="col">Consent</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((contact) => (
                    <tr key={contact.id}>
                      <td>
                        <Checkbox
                          hideLabel
                          id={`select-${contact.id}`}
                          labelText={`Select ${contact.name}`}
                          checked={selected.includes(contact.id)}
                          onChange={() => toggleSelection(contact.id)}
                        />
                      </td>
                      <td>
                        <div className="contact-cell">
                          <span className="avatar">{contact.initials}</span>
                          <span>
                            <Link href={`/contacts/${contact.id}`}>{contact.name}</Link>
                            <small>
                              {contact.title} · {contact.organization} · {contact.industry}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        {contact.type}
                        <span className="table-subtext">{contact.source}</span>
                      </td>
                      <td>
                        {contact.campaign}
                        <span className="table-subtext">{contact.stage}</span>
                      </td>
                      <td>{contact.lastInteraction}</td>
                      <td>
                        {contact.nextActionType.replaceAll('_', ' ').toLocaleLowerCase()}
                        <span className="table-subtext">
                          {new Date(contact.nextActionAt).toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <strong className="mono" style={{ fontSize: '.8rem' }}>
                          {contact.responseRate}%
                        </strong>
                        <span className="table-subtext">historical reply rate</span>
                      </td>
                      <td>
                        <span
                          className={`status-badge status-badge--${
                            contact.consent === 'Granted'
                              ? 'clear'
                              : contact.consent === 'Suppressed'
                                ? 'due'
                                : 'attention'
                          }`}
                        >
                          {contact.consent}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              backwardText="Previous page"
              forwardText="Next page"
              itemsPerPageText="Contacts per page:"
              page={1}
              pageSize={10}
              pageSizes={[10, 25, 50]}
              totalItems={248}
            />
          </div>
        ) : (
          <div className="panel empty-state">
            <Search size={40} />
            <h2>No contacts match these filters</h2>
            <p>
              Clear one or more filters, or search for a different name, organization, or email.
            </p>
            <Button
              kind="tertiary"
              onClick={() => {
                setQuery('');
                setType('All types');
                setCampaign('All campaigns');
                setIndustry('All categories');
                setSource('All sources');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
