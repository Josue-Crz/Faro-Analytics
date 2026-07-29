'use client';

import { ArrowLeft, Email, Launch, Phone, Task } from '@carbon/icons-react';
import { Button } from '@carbon/react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';

import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { bobDrafts, contacts, followUps } from '@/lib/demo-data';

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const contact = contacts.find((item) => item.id === params.id);

  if (!contact) notFound();

  const task = followUps.find((item) => item.contactId === contact.id);
  const draft = bobDrafts.find((item) => item.contact === contact.name);

  return (
    <div className="page-shell">
      <Link className="back-link" href="/contacts">
        <ArrowLeft size={16} /> All contacts
      </Link>
      <PageHeader
        actions={
          <>
            <Button
              disabled
              kind="tertiary"
              renderIcon={Phone}
              size="md"
              title="Interaction writes require database mode"
            >
              Log call
            </Button>
            <Button
              disabled
              kind="secondary"
              renderIcon={Email}
              size="md"
              title="Interaction writes require database mode"
            >
              Log email
            </Button>
            <Button
              href={task ? `/follow-ups?task=${task.id}` : '/follow-ups'}
              renderIcon={Task}
              size="md"
            >
              {task ? 'Open follow-up' : 'Create follow-up'}
            </Button>
          </>
        }
        description={`${contact.title} at ${contact.organization} · ${contact.timezone}`}
        eyebrow={`${contact.type} · ${contact.stage}`}
        title={contact.name}
      />

      <div className="profile-grid">
        <aside className="panel profile-summary" aria-labelledby="profile-summary-title">
          <div className="contact-cell profile-identity">
            <span className="avatar avatar--large">{contact.initials}</span>
            <span>
              <h2 id="profile-summary-title">Contact details</h2>
              <small>Updated from {contact.source}</small>
            </span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </dd>
            </div>
            <div>
              <dt>Organization</dt>
              <dd>{contact.organization}</dd>
            </div>
            <div>
              <dt>Company category</dt>
              <dd>{contact.industry}</dd>
            </div>
            <div>
              <dt>Preferred channel</dt>
              <dd>Email</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd className="mono">{contact.timezone}</dd>
            </div>
            <div>
              <dt>Consent</dt>
              <dd>{contact.consent}</dd>
            </div>
            <div>
              <dt>External ID</dt>
              <dd className="mono">SHEET-{contact.id.slice(-6).toUpperCase()}</dd>
            </div>
          </dl>
          <div className="tag-list" aria-label="Contact tags">
            {contact.tags.map((tag) => (
              <span className="faro-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </aside>

        <div className="profile-main">
          {task ? (
            <section className="panel recommendation-panel" aria-labelledby="recommendation-title">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Next outreach signal</p>
                  <h2 id="recommendation-title" style={{ marginTop: '.5rem' }}>
                    {task.recommendedWindow}
                  </h2>
                </div>
                <StatusBadge
                  label={`${task.confidence}% confidence · ${task.sufficiency} data`}
                  status={task.sufficiency === 'Sparse' ? 'insufficient' : 'clear'}
                />
              </div>
              <p className="recommendation-copy">{task.explanation}</p>
              <div className="tag-list" aria-label="Recommendation reason codes">
                {task.reasonCodes.map((reason) => (
                  <code className="faro-tag" key={reason}>
                    {reason}
                  </code>
                ))}
              </div>
              <div className="recommendation-footer">
                <span className="mono">Algorithm faro-window-v1.0.0</span>
                <Link href={`/follow-ups?task=${task.id}`}>
                  Review recommendation <Launch size={14} />
                </Link>
              </div>
            </section>
          ) : null}

          <section className="panel" aria-labelledby="timeline-title">
            <div className="panel__header">
              <div>
                <h2 id="timeline-title">Interaction timeline</h2>
                <p>Outbound activity, responses, and human-reviewed analysis</p>
              </div>
            </div>
            <ol className="interaction-list">
              <li>
                <span className="interaction-icon">
                  <Email size={16} />
                </span>
                <div>
                  <div className="interaction-heading">
                    <strong>Inbound response</strong>
                    <time>{task?.lastResponseAt ?? 'Jul 8, 2:14 PM'}</time>
                  </div>
                  <p>
                    {task?.lastResponse ??
                      'Thanks for reaching out. Please send the program overview.'}
                  </p>
                  <div className="tag-list">
                    <span className="faro-tag">Interested</span>
                    <span className="faro-tag">Human reviewed</span>
                  </div>
                </div>
              </li>
              <li>
                <span className="interaction-icon">
                  <Email size={16} />
                </span>
                <div>
                  <div className="interaction-heading">
                    <strong>Outbound email</strong>
                    <time>Jul 7, 9:05 AM</time>
                  </div>
                  <p>Shared the campaign overview and a concise partnership summary.</p>
                  <div className="tag-list">
                    <span className="faro-tag">Delivered</span>
                    <span className="faro-tag">Manually approved</span>
                  </div>
                </div>
              </li>
              <li>
                <span className="interaction-icon">
                  <Phone size={16} />
                </span>
                <div>
                  <div className="interaction-heading">
                    <strong>Discovery call</strong>
                    <time>Jun 24, 11:30 AM</time>
                  </div>
                  <p>
                    Discussed mission alignment, decision timeline, and the approved sponsorship
                    range.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section className="panel" aria-labelledby="draft-title">
            <div className="panel__header">
              <div>
                <h2 id="draft-title">IBM Bob drafts</h2>
                <p>All AI-assisted content remains editable and requires approval</p>
              </div>
              {draft ? (
                <StatusBadge
                  label={draft.provenance}
                  status={draft.status === 'Awaiting IBM Bob' ? 'awaiting' : 'ready'}
                />
              ) : null}
            </div>
            {draft ? (
              <div className="draft-summary">
                <div>
                  <span>Request</span>
                  <code>{draft.requestId}</code>
                </div>
                <div>
                  <span>Prompt</span>
                  <code>{draft.promptVersion}</code>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{draft.status}</strong>
                </div>
                <Button
                  href={task ? `/follow-ups?task=${task.id}` : '/follow-ups'}
                  kind="tertiary"
                  size="sm"
                >
                  {draft.status === 'Awaiting IBM Bob'
                    ? 'View workflow prompt'
                    : 'Review demo draft'}
                </Button>
              </div>
            ) : (
              <div className="empty-inline">No draft has been requested for this contact.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
