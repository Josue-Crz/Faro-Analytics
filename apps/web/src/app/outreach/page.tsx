'use client';

import { Search } from '@carbon/icons-react';
import { Button, InlineNotification } from '@carbon/react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { COMPANY_CATEGORIES } from '@faro/core';
import { contacts, followUps } from '@/lib/demo-data';

export default function OutreachPage() {
  const [industry, setIndustry] = useState('All categories');
  const [query, setQuery] = useState('');
  const visibleContacts = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          (industry === 'All categories' || contact.industry === industry) &&
          `${contact.name} ${contact.organization} ${contact.industry} ${contact.email}`
            .toLocaleLowerCase('en-US')
            .includes(query.toLocaleLowerCase('en-US')),
      ),
    [industry, query],
  );
  return (
    <div className="page-shell">
      <PageHeader
        description="A fictional preview of the combined contacts, follow-ups, and email context workspace."
        eyebrow="Demo fallback · no mailbox access"
        title="Outreach center"
      />
      <InlineNotification
        hideCloseButton
        kind="info"
        lowContrast
        title="Fictional fallback active"
        subtitle="Google OAuth did not complete, so these are local Jordan Lee demonstration records. Faro did not read your Gmail."
      />
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Tracked outreach email</h2>
            <p>Connect Google successfully, then refresh Gmail history to replace this preview.</p>
          </div>
          <Button disabled>Refresh Gmail history</Button>
        </div>
      </section>
      <div className="filters-bar" aria-label="Outreach search filters">
        <div className="filters-bar__group">
          <label className="search-field">
            <span className="visually-hidden">Search outreach contacts</span>
            <Search aria-hidden size={16} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search contact, company, or email"
              type="search"
              value={query}
            />
          </label>
          <select
            aria-label="Filter outreach contacts by company category"
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
      <section
        aria-label="Demo outreach contacts. Scroll within this contact window to browse results."
        className="panel panel--flush record-scroll-region record-scroll-region--compact"
        tabIndex={0}
      >
        {visibleContacts.map((contact) => {
          const tasks = followUps.filter((task) => task.contactId === contact.id);
          return (
            <div className="list-card" key={contact.id}>
              <div>
                <h3>{contact.name}</h3>
                <p>
                  {contact.organization} · {contact.industry} · {tasks.length} follow-up
                  {tasks.length === 1 ? '' : 's'} · Demo email context
                </p>
              </div>
              <Button disabled kind="ghost" size="sm">
                IBM Bob demo
              </Button>
            </div>
          );
        })}
        {!visibleContacts.length ? (
          <p style={{ padding: '1.25rem' }}>No outreach contacts match this search and category.</p>
        ) : null}
      </section>
    </div>
  );
}
