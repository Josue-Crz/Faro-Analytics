'use client';

import { Add, Renew, Search, TrashCan, Upload } from '@carbon/icons-react';
import { Button, InlineNotification, TextArea, TextInput } from '@carbon/react';
import { useEffect, useState } from 'react';

import { PageHeader } from './PageHeader';
import { MetricCard } from './MetricCard';

interface Records {
  bobRequests: Array<{
    contactId: string;
    draft: { approvalStatus: string; bodyText: string; id: string; subject: string } | null;
    id: string;
    requestedAt: string;
    status: string;
  }>;
  campaigns: Array<{
    _count: { campaignContacts: number; followUpTasks: number };
    campaignContacts: Array<{ contactId: string }>;
    id: string;
    name: string;
    objective: string;
    status: string;
    type: string;
  }>;
  contacts: Array<{
    consentStatus: string;
    email: string | null;
    firstName: string;
    id: string;
    lastName: string;
    organization: { name: string } | null;
    source: string | null;
    type: string;
  }>;
  followUps: Array<{
    contact: { firstName: string; id: string; lastName: string };
    dueAt: string;
    id: string;
    priority: string;
    reason: string;
    status: string;
  }>;
  importedFollowUps: Array<{ contactId: string; contactName: string; dueAt: string }>;
  interactions: Array<{
    bodyText: string;
    campaign: { name: string } | null;
    contact: { firstName: string; id: string; lastName: string };
    direction: string;
    id: string;
    occurredAt: string;
    subject: string | null;
  }>;
  organizations: Array<{
    _count: { contacts: number };
    contacts: Array<{
      consentStatus: string;
      email: string | null;
      firstName: string;
      id: string;
      lastName: string;
      title: string | null;
      type: string;
    }>;
    id: string;
    name: string;
    type: string;
    website: string | null;
  }>;
  trashedOrganizations: Array<{
    _count: { contacts: number };
    deletedAt: string;
    id: string;
    name: string;
    type: string;
    website: string | null;
  }>;
}

interface CampaignAnalytics {
  averageResponseMinutes: number | null;
  awaitingBob: number;
  contacts: number;
  delivered: number;
  draftsReady: number;
  followUpsOpen: number;
  id: string;
  interactions: number;
  name: string;
  objective: string;
  positiveResponses: number;
  positiveResponseRate: number;
  responses: number;
  responseRate: number;
  status: string;
  type: string;
}

const routeTitles: Record<string, [string, string]> = {
  '/analytics': [
    'Analytics',
    'Analytics remain empty until the connected workspace has real activity.',
  ],
  '/campaigns': [
    'Campaigns',
    'Campaigns are created by workspace users, never implicitly by a Sheet import.',
  ],
  '/contacts': ['Contacts', 'Google Sheet contacts imported into this connected workspace.'],
  '/follow-ups': [
    'Follow-ups',
    'Imported dates remain pending until you assign the contact to a campaign.',
  ],
  '/organizations': [
    'Organizations',
    'Organizations derived from explicitly imported contact rows.',
  ],
  '/outreach': [
    'Outreach center',
    'Contacts, follow-ups, tracked email context, and IBM Bob draft requests in one place.',
  ],
};

export function ConnectedWorkspaceRecords({ pathname }: { pathname: string }) {
  const route =
    Object.keys(routeTitles).find((candidate) => pathname.startsWith(candidate)) ?? pathname;
  const [data, setData] = useState<Records | null>(null);
  const [error, setError] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignObjective, setCampaignObjective] = useState('');
  const [campaignType, setCampaignType] = useState('SPONSORSHIP');
  const [followUpCampaignId, setFollowUpCampaignId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [campaignContactQuery, setCampaignContactQuery] = useState('');
  const [analytics, setAnalytics] = useState<CampaignAnalytics[]>([]);
  const [analyticsCampaignId, setAnalyticsCampaignId] = useState('');

  async function load() {
    const response = await fetch('/api/workspace/records', { cache: 'no-store' });
    if (!response.ok) throw new Error('records');
    const result = (await response.json()) as { data: Records };
    setData(result.data);
    setFollowUpCampaignId((current) => current || result.data.campaigns[0]?.id || '');
    setSelectedCampaignId((current) => current || result.data.campaigns[0]?.id || '');
  }
  useEffect(() => {
    void fetch('/api/workspace/records', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('records');
        return (await response.json()) as { data: Records };
      })
      .then((result) => {
        setData(result.data);
        setFollowUpCampaignId(result.data.campaigns[0]?.id ?? '');
        setSelectedCampaignId(result.data.campaigns[0]?.id ?? '');
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (route !== '/analytics') return;
    void fetch('/api/campaigns/analytics', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('analytics');
        return (await response.json()) as { data: CampaignAnalytics[] };
      })
      .then((result) => {
        setAnalytics(result.data);
        setAnalyticsCampaignId(result.data[0]?.id ?? '');
      })
      .catch(() => setError(true));
  }, [route]);

  async function createCampaign() {
    const response = await fetch('/api/workspace/records', {
      body: JSON.stringify({
        name: campaignName,
        objective: campaignObjective,
        type: campaignType,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) {
      setNotice('Faro could not create that campaign. Check the required fields.');
      return;
    }
    const result = (await response.json()) as { data: { id: string } };
    setCampaignName('');
    setCampaignObjective('');
    setNotice('Campaign created as a draft.');
    await load();
    setSelectedCampaignId(result.data.id);
  }

  async function assignContacts() {
    if (!selectedCampaignId || !selectedContactIds.length) return;
    const response = await fetch(`/api/campaigns/${selectedCampaignId}/contacts`, {
      body: JSON.stringify({ contactIds: selectedContactIds }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) {
      setNotice('Faro could not associate those contacts with the campaign.');
      return;
    }
    setNotice(`${selectedContactIds.length} contacts associated with the campaign.`);
    setSelectedContactIds([]);
    await load();
  }

  async function activateImportedFollowUps() {
    const response = await fetch('/api/workspace/follow-ups/activate', {
      body: JSON.stringify({ campaignId: followUpCampaignId }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json().catch(() => null)) as {
      data?: { activated: number };
    } | null;
    if (!response.ok || !result?.data) {
      setNotice('Faro could not activate the imported follow-ups.');
      return;
    }
    setNotice(`${result.data.activated} imported follow-ups assigned to the selected campaign.`);
    await load();
  }

  async function updateOrganizationTrash(id: string, action: 'trash' | 'restore') {
    const response = await fetch(`/api/organizations/${id}/trash`, {
      body: JSON.stringify({ action }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    if (!response.ok) {
      setNotice(`Faro could not ${action === 'trash' ? 'move' : 'restore'} that organization.`);
      return;
    }
    setNotice(
      action === 'trash'
        ? 'Organization and its contacts moved to Trash.'
        : 'Organization and its contacts restored.',
    );
    await load();
  }

  const [title, description] = routeTitles[route] ?? ['Connected workspace', 'Real workspace data'];
  if (error)
    return <InlineNotification hideCloseButton kind="error" title="Workspace data unavailable" />;
  if (!data)
    return (
      <div
        className="skeleton"
        style={{ height: '18rem' }}
        aria-label="Loading workspace records"
      />
    );
  const associationCampaign = data.campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const associationContacts = data.contacts.filter((contact) =>
    `${contact.firstName} ${contact.lastName} ${contact.email ?? ''} ${contact.organization?.name ?? ''}`
      .toLocaleLowerCase('en-US')
      .includes(campaignContactQuery.toLocaleLowerCase('en-US')),
  );
  const selectableAssociationContacts = associationContacts.filter(
    (contact) =>
      !associationCampaign?.campaignContacts.some((item) => item.contactId === contact.id),
  );

  return (
    <div className="page-shell">
      <PageHeader
        actions={
          route === '/contacts' || route === '/organizations' ? (
            <Button href="/integrations/google-sheets" renderIcon={Upload}>
              Import Google Sheet
            </Button>
          ) : undefined
        }
        description={description}
        eyebrow="Connected workspace · Real data only"
        title={title}
      />
      {notice ? (
        <InlineNotification hideCloseButton kind="info" lowContrast title={notice} />
      ) : null}

      {route === '/campaigns' ? (
        <>
          <section className="panel">
            <h2>Create campaign</h2>
            <div className="sheet-preview-actions">
              <TextInput
                id="campaign-name"
                labelText="Campaign name"
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
              />
              <TextArea
                id="campaign-objective"
                labelText="Objective"
                value={campaignObjective}
                onChange={(event) => setCampaignObjective(event.target.value)}
              />
              <label>
                <span>Campaign type</span>
                <select
                  className="filter-select"
                  value={campaignType}
                  onChange={(event) => setCampaignType(event.target.value)}
                >
                  <option value="SPONSORSHIP">Sponsorship</option>
                  <option value="PARTNERSHIP">Partnership</option>
                  <option value="PARTICIPANT_OUTREACH">Participant outreach</option>
                  <option value="FUNDRAISING">Fundraising</option>
                  <option value="EVENT">Event</option>
                  <option value="COMMUNITY">Community</option>
                </select>
              </label>
              <Button
                disabled={!campaignName.trim() || !campaignObjective.trim()}
                onClick={() => void createCampaign()}
                renderIcon={Add}
              >
                Create draft campaign
              </Button>
            </div>
          </section>
          <RecordList
            empty="No campaigns yet. Create the first campaign above."
            rows={data.campaigns.map((item) => ({
              id: item.id,
              primary: item.name,
              secondary: `${item.type} · ${item.status} · ${item._count.campaignContacts} contacts · ${item._count.followUpTasks} follow-ups`,
            }))}
          />
          {data.campaigns.length ? (
            <section className="panel">
              <h2>Associate contacts</h2>
              <div className="form-row">
                <label>
                  <span>Existing campaign</span>
                  <select
                    className="filter-select"
                    value={selectedCampaignId}
                    onChange={(event) => setSelectedCampaignId(event.target.value)}
                  >
                    {data.campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="search-field">
                  <span className="visually-hidden">Search contacts to associate</span>
                  <Search aria-hidden size={16} />
                  <input
                    onChange={(event) => setCampaignContactQuery(event.target.value)}
                    placeholder="Search contacts"
                    type="search"
                    value={campaignContactQuery}
                  />
                </label>
              </div>
              <div className="page-actions" style={{ marginBlock: '1rem' }}>
                <Button
                  kind="ghost"
                  size="sm"
                  disabled={!selectableAssociationContacts.length}
                  onClick={() =>
                    setSelectedContactIds((current) => [
                      ...new Set([
                        ...current,
                        ...selectableAssociationContacts.map((contact) => contact.id),
                      ]),
                    ])
                  }
                >
                  Select all shown
                </Button>
                <Button
                  kind="ghost"
                  size="sm"
                  disabled={!selectedContactIds.length}
                  onClick={() => setSelectedContactIds([])}
                >
                  Clear
                </Button>
                <span className="mono" style={{ fontSize: '.75rem' }}>
                  {selectedContactIds.length} selected
                </span>
              </div>
              <div
                style={{
                  border: '1px solid var(--cds-border-subtle)',
                  maxHeight: '16rem',
                  overflowY: 'auto',
                  padding: '.5rem 1rem',
                }}
              >
                {associationContacts.map((contact) => {
                  const assigned = associationCampaign?.campaignContacts.some(
                    (item) => item.contactId === contact.id,
                  );
                  return (
                    <label
                      key={contact.id}
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        gap: '.5rem',
                        marginBlock: '.35rem',
                      }}
                    >
                      <input
                        checked={assigned || selectedContactIds.includes(contact.id)}
                        disabled={assigned}
                        onChange={(event) =>
                          setSelectedContactIds((current) =>
                            event.target.checked
                              ? [...current, contact.id]
                              : current.filter((id) => id !== contact.id),
                          )
                        }
                        type="checkbox"
                      />{' '}
                      <span>
                        {contact.firstName} {contact.lastName}
                        <small className="table-subtext">
                          {contact.organization?.name ?? 'No organization'} ·{' '}
                          {contact.email ?? 'No email'}
                          {assigned ? ' · already assigned' : ''}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="page-actions" style={{ marginTop: '1rem' }}>
                <Button disabled={!selectedContactIds.length} onClick={() => void assignContacts()}>
                  Add selected contacts
                </Button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      {route === '/contacts' ? (
        <RecordList
          empty="No contacts yet. Import a Google Sheet to add them."
          rows={data.contacts.map((item) => ({
            id: item.id,
            primary: `${item.firstName} ${item.lastName}`,
            secondary: `${item.email ?? 'No email'} · ${item.organization?.name ?? 'No organization'} · ${item.consentStatus}`,
          }))}
        />
      ) : null}
      {route === '/organizations' ? (
        <OrganizationRoster
          organizations={data.organizations}
          trashedOrganizations={data.trashedOrganizations}
          updateTrash={updateOrganizationTrash}
        />
      ) : null}
      {route === '/follow-ups' ? (
        <>
          {data.importedFollowUps.length ? (
            <section className="panel">
              <h2>Assign imported follow-ups</h2>
              {data.campaigns.length ? (
                <div className="sheet-preview-actions">
                  <label>
                    <span>Campaign</span>
                    <select
                      className="filter-select"
                      onChange={(event) => setFollowUpCampaignId(event.target.value)}
                      value={followUpCampaignId}
                    >
                      {data.campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    disabled={!followUpCampaignId}
                    onClick={() => void activateImportedFollowUps()}
                  >
                    Activate pending follow-ups
                  </Button>
                </div>
              ) : (
                <p>Create a campaign first. Faro will not invent one during import.</p>
              )}
            </section>
          ) : null}
          <RecordList
            empty="No active follow-up tasks. Create a campaign and assign contacts before activating pending dates."
            rows={data.followUps.map((item) => ({
              id: item.id,
              primary: `${item.contact.firstName} ${item.contact.lastName}`,
              secondary: `${new Date(item.dueAt).toLocaleString()} · ${item.status} · ${item.reason}`,
            }))}
          />
          {data.importedFollowUps.length ? (
            <InlineNotification
              hideCloseButton
              kind="warning"
              lowContrast
              title={`${data.importedFollowUps.length} imported follow-up dates are pending campaign assignment`}
              subtitle="Faro preserved these dates but did not invent a campaign or activate outreach automatically."
            />
          ) : null}
        </>
      ) : null}
      {route === '/outreach' ? <OutreachCenter records={data} reload={load} /> : null}
      {route === '/analytics' ? (
        <CampaignAnalyticsView
          campaigns={analytics}
          selectedId={analyticsCampaignId}
          setSelectedId={setAnalyticsCampaignId}
        />
      ) : null}
    </div>
  );
}

function OutreachCenter({ records, reload }: { records: Records; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [bobContext, setBobContext] = useState('');
  const [emailSignature, setEmailSignature] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [associateWithCampaign, setAssociateWithCampaign] = useState(false);
  const [contactFeedback, setContactFeedback] = useState<Record<string, string>>({});
  const [requestingContactId, setRequestingContactId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [latestRequestId, setLatestRequestId] = useState<string | null>(null);
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);

  async function copyDraftText(draftId: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedDraftId(draftId);
  }

  async function syncGmail() {
    setBusy(true);
    const response = await fetch('/api/integrations/gmail/sync', { method: 'POST' });
    const result = (await response.json().catch(() => null)) as {
      data?: { imported: number; listed: number; skipped: number };
      error?: string;
      reconnect?: string;
    } | null;
    if (response.status === 409 && result?.reconnect) {
      window.location.assign(result.reconnect);
      return;
    }
    if (!response.ok || !result?.data) {
      setMessage('Gmail could not be read. Existing outreach history was preserved.');
      setBusy(false);
      return;
    }
    setMessage(
      `Email history refreshed: ${result.data.imported} matched existing contacts; ${result.data.skipped} unmatched messages stayed out of Faro.`,
    );
    await reload();
    setBusy(false);
  }

  async function requestDraft(contactId: string, consentStatus: string) {
    const campaign = records.campaigns.find((item) => item.id === campaignId);
    const followUp = campaign
      ? records.followUps.find((item) => item.contact.id === contactId)
      : undefined;
    setRequestingContactId(contactId);
    setContactFeedback((current) => ({
      ...current,
      [contactId]: 'Creating governed IBM Bob request…',
    }));
    setBusy(true);
    const additionalContext = [
      bobContext.trim(),
      emailSignature.trim()
        ? `Include this signature verbatim at the end of the proposed email:\n${emailSignature.trim()}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (consentStatus === 'UNKNOWN') {
      const consentResponse = await fetch(`/api/contacts/${contactId}/consent`, {
        body: JSON.stringify({ status: 'IMPLIED' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!consentResponse.ok) {
        setContactFeedback((current) => ({
          ...current,
          [contactId]: 'Faro could not record the outreach basis. No IBM Bob request was created.',
        }));
        setBusy(false);
        setRequestingContactId(null);
        return;
      }
    }
    const response = await fetch('/api/bob/generation-requests', {
      body: JSON.stringify({
        campaignId: campaign?.id ?? null,
        associateWithCampaign: Boolean(campaign && associateWithCampaign),
        contactId,
        additionalContext,
        followUpTaskId: followUp?.id ?? null,
        objective: followUp ? 'FOLLOW_UP' : 'INITIAL_INTRODUCTION',
        tone: 'PROFESSIONAL',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const result = (await response.json().catch(() => null)) as {
      data?: { id: string; status: string };
      error?: string;
      message?: string;
      runtimeError?: string | null;
    } | null;
    if (response.ok && result?.data) {
      const data = result.data;
      const requestId = data.id;
      setLatestRequestId(requestId);
      setContactFeedback((current) => ({
        ...current,
        [contactId]:
          data.status === 'COMPLETED'
            ? `IBM Bob returned a draft successfully. Subject and body are shown below.`
            : data.status === 'FAILED'
              ? `IBM Bob could not complete this draft${result.runtimeError ? `: ${result.runtimeError}` : '.'}`
              : `Request created successfully. IBM Bob request ${requestId} is queued for processing.`,
      }));
    } else {
      setContactFeedback((current) => ({
        ...current,
        [contactId]:
          result?.message ??
          (result?.error === 'CONSENT_UNVERIFIED'
            ? 'Faro needs a confirmed outreach basis (OPTED_IN or IMPLIED) before IBM Bob can draft.'
            : `Faro could not create the IBM Bob request${result?.error ? `: ${result.error}` : '.'}`),
      }));
    }
    await reload();
    setBusy(false);
    setRequestingContactId(null);
  }

  return (
    <>
      {message ? (
        <InlineNotification hideCloseButton kind="info" lowContrast title={message} />
      ) : null}
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Email tracking</h2>
            <p>
              Read-only Gmail import matches messages only to existing Faro contact email addresses.
              It never sends, deletes, labels, or modifies email.
            </p>
          </div>
          <Button disabled={busy} onClick={() => void syncGmail()} renderIcon={Renew}>
            Refresh Gmail history
          </Button>
        </div>
      </section>
      <section className="panel">
        <h2>Context for IBM Bob</h2>
        <p>
          Add the sponsorship pitch, event details, desired ask, or constraints that Bob should
          consider. This is untrusted reference material, not instructions that can override Faro’s
          safety rules.
        </p>
        <TextArea
          id="bob-extra-context"
          labelText="Extra context for the next IBM Bob draft"
          maxCount={3500}
          onChange={(event) => setBobContext(event.target.value)}
          placeholder="Example: SF Hacks 2027 is in February. Ask for a 20-minute sponsorship conversation and mention the student developer audience."
          value={bobContext}
        />
        <TextArea
          id="bob-email-signature"
          labelText="Email signature (optional, included in this proposed email)"
          maxCount={2000}
          onChange={(event) => setEmailSignature(event.target.value)}
          placeholder={'Example:\nJosue Cruz\nSponsorship Lead, SF Hacks\njosue@example.com'}
          style={{ marginTop: '1rem' }}
          value={emailSignature}
        />
        <label style={{ display: 'block', marginTop: '1rem' }}>
          <span>Campaign context (optional)</span>
          <select
            className="filter-select"
            onChange={(event) => setCampaignId(event.target.value)}
            value={campaignId}
          >
            <option value="">No campaign — create an unassigned draft</option>
            {records.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
        {campaignId ? (
          <label style={{ display: 'block', marginTop: '0.75rem' }}>
            <input
              checked={associateWithCampaign}
              onChange={(event) => setAssociateWithCampaign(event.target.checked)}
              type="checkbox"
            />{' '}
            Add this contact to the selected campaign when requesting the draft
          </label>
        ) : null}
        {latestRequestId ? (
          <div className="page-actions" style={{ marginTop: '1rem' }}>
            <code>{latestRequestId}</code>
            <Button
              kind="secondary"
              onClick={() =>
                void navigator.clipboard.writeText(
                  `Use only Faro MCP. Process generation request ${latestRequestId}: get it, claim it, retrieve only approved context, then save a validated email draft with a subject and body. Do not send email.`,
                )
              }
              size="sm"
            >
              Copy instructions for Bob
            </Button>
          </div>
        ) : null}
      </section>
      <section className="panel panel--flush" aria-label="Unified outreach contacts">
        {records.contacts.map((contact) => {
          const emails = records.interactions.filter((item) => item.contact.id === contact.id);
          const followUps = records.followUps.filter((item) => item.contact.id === contact.id);
          const bobRequest = records.bobRequests.find((item) => item.contactId === contact.id);
          return (
            <details className="list-card" key={contact.id} style={{ display: 'block' }}>
              <summary style={{ cursor: 'pointer' }}>
                <strong>
                  {contact.firstName} {contact.lastName}
                </strong>{' '}
                · {contact.organization?.name ?? 'No organization'} · {emails.length} tracked email
                {emails.length === 1 ? '' : 's'} · {followUps.length} follow-up
                {followUps.length === 1 ? '' : 's'}
              </summary>
              <div style={{ paddingTop: '1rem' }}>
                <p>
                  {contact.email ?? 'No email'} · Consent: {contact.consentStatus}
                </p>
                {followUps.map((followUp) => (
                  <p key={followUp.id}>
                    <strong>Follow-up:</strong> {new Date(followUp.dueAt).toLocaleString()} ·{' '}
                    {followUp.reason}
                  </p>
                ))}
                {emails.slice(0, 20).map((email) => (
                  <article
                    key={email.id}
                    style={{
                      borderTop: '1px solid var(--cds-border-subtle)',
                      padding: '0.75rem 0',
                    }}
                  >
                    <p>
                      <strong>{email.direction === 'INBOUND' ? 'Received' : 'Sent'}:</strong>{' '}
                      {email.subject ?? '(no subject)'} ·{' '}
                      {new Date(email.occurredAt).toLocaleString()}
                    </p>
                    <p>{email.bodyText.slice(0, 500)}</p>
                  </article>
                ))}
                <div className="page-actions">
                  <Button
                    disabled={
                      busy ||
                      !contact.email ||
                      contact.consentStatus === 'OPTED_OUT' ||
                      contact.consentStatus === 'SUPPRESSED'
                    }
                    onClick={() => void requestDraft(contact.id, contact.consentStatus)}
                    size="sm"
                  >
                    {requestingContactId === contact.id
                      ? 'Requesting IBM Bob draft…'
                      : contact.consentStatus === 'UNKNOWN'
                        ? 'Confirm outreach basis & request draft'
                        : 'Request IBM Bob draft'}
                  </Button>
                  {contact.consentStatus === 'UNKNOWN' ? (
                    <span>
                      By continuing, you confirm a reasonable business basis to contact this person.
                    </span>
                  ) : null}
                </div>
                {contactFeedback[contact.id] ? (
                  <InlineNotification
                    hideCloseButton
                    kind={
                      contactFeedback[contact.id]?.startsWith('Request created')
                        ? 'success'
                        : 'info'
                    }
                    lowContrast
                    style={{ marginTop: '0.75rem' }}
                    title={contactFeedback[contact.id]!}
                  />
                ) : null}
                {bobRequest ? (
                  <section
                    aria-label="Latest IBM Bob draft"
                    style={{
                      borderTop: '1px solid var(--cds-border-subtle)',
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                    }}
                  >
                    <p>
                      <strong>Latest IBM Bob request:</strong>{' '}
                      {bobRequest.draft
                        ? `Draft ready · ${bobRequest.draft.approvalStatus}`
                        : bobRequest.status}
                      <span>
                        {' '}
                        · initialized {new Date(bobRequest.requestedAt).toLocaleString()}
                      </span>
                    </p>
                    {bobRequest.draft ? (
                      <div aria-label="Proposed email" style={{ marginTop: '0.75rem' }}>
                        <h3>Proposed email</h3>
                        <p>
                          <strong>Subject Line</strong>
                          <br />
                          {bobRequest.draft.subject}
                        </p>
                        <p>
                          <strong>Email Description</strong>
                          <br />
                          <span style={{ whiteSpace: 'pre-wrap' }}>
                            {bobRequest.draft.bodyText}
                          </span>
                        </p>
                        <div className="page-actions" aria-label="Copy proposed email">
                          <Button
                            kind="secondary"
                            onClick={() =>
                              void copyDraftText(
                                `${bobRequest.draft!.id}:subject`,
                                bobRequest.draft!.subject,
                              )
                            }
                            size="sm"
                          >
                            {copiedDraftId === `${bobRequest.draft.id}:subject`
                              ? 'Subject copied'
                              : 'Copy subject'}
                          </Button>
                          <Button
                            kind="secondary"
                            onClick={() =>
                              void copyDraftText(
                                `${bobRequest.draft!.id}:body`,
                                bobRequest.draft!.bodyText,
                              )
                            }
                            size="sm"
                          >
                            {copiedDraftId === `${bobRequest.draft.id}:body`
                              ? 'Email copied'
                              : 'Copy email'}
                          </Button>
                          <Button
                            onClick={() =>
                              void copyDraftText(
                                `${bobRequest.draft!.id}:all`,
                                `Subject: ${bobRequest.draft!.subject}\n\n${bobRequest.draft!.bodyText}`,
                              )
                            }
                            size="sm"
                          >
                            {copiedDraftId === `${bobRequest.draft.id}:all`
                              ? 'Subject and email copied'
                              : 'Copy subject and email'}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            </details>
          );
        })}
        {!records.contacts.length ? (
          <p style={{ padding: '1.25rem' }}>No contacts yet. Import a Google Sheet first.</p>
        ) : null}
      </section>
    </>
  );
}

function OrganizationRoster({
  organizations,
  trashedOrganizations,
  updateTrash,
}: {
  organizations: Records['organizations'];
  trashedOrganizations: Records['trashedOrganizations'];
  updateTrash: (id: string, action: 'trash' | 'restore') => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const visible = organizations.filter((organization) =>
    `${organization.name} ${organization.contacts.map((contact) => `${contact.firstName} ${contact.lastName} ${contact.email ?? ''}`).join(' ')}`
      .toLocaleLowerCase('en-US')
      .includes(query.toLocaleLowerCase('en-US')),
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Active organizations</h2>
          <p>{organizations.length} currently present in Faro or a connected Sheet</p>
        </div>
      </div>
      <div className="filters-bar">
        <label className="search-field">
          <span className="visually-hidden">Search organizations or affiliated contacts</span>
          <Search aria-hidden size={16} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search organization, person, or email"
            type="search"
            value={query}
          />
        </label>
      </div>
      <section className="panel panel--flush" aria-label="Organizations and affiliated contacts">
        {visible.map((organization) => {
          const open = expanded.includes(organization.id);
          return (
            <div key={organization.id}>
              <div className="list-card">
                <button
                  aria-expanded={open}
                  onClick={() =>
                    setExpanded((current) =>
                      current.includes(organization.id)
                        ? current.filter((id) => id !== organization.id)
                        : [...current, organization.id],
                    )
                  }
                  style={{
                    background: 'none',
                    border: 0,
                    cursor: 'pointer',
                    flex: 1,
                    padding: 0,
                    textAlign: 'left',
                  }}
                  type="button"
                >
                  <h3>{organization.name}</h3>
                  <p>
                    {organization.type} · {organization._count.contacts} affiliated contact
                    {organization._count.contacts === 1 ? '' : 's'}
                    {organization.website ? ` · ${organization.website}` : ''} ·{' '}
                    {open ? 'hide' : 'show'} contacts
                  </p>
                </button>
                <Button
                  hasIconOnly
                  iconDescription={`Move ${organization.name} to Trash`}
                  kind="ghost"
                  onClick={() => void updateTrash(organization.id, 'trash')}
                  renderIcon={TrashCan}
                  size="sm"
                  tooltipPosition="left"
                />
              </div>
              {open ? (
                <div style={{ padding: '0 1.25rem 1.25rem' }}>
                  {organization.contacts.length ? (
                    <table className="faro-table">
                      <thead>
                        <tr>
                          <th>Person</th>
                          <th>Affiliation / role</th>
                          <th>Contact type</th>
                          <th>Email</th>
                          <th>Consent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {organization.contacts.map((contact) => (
                          <tr key={contact.id}>
                            <td>
                              <strong>
                                {contact.firstName} {contact.lastName}
                              </strong>
                            </td>
                            <td>{contact.title ?? `Affiliated with ${organization.name}`}</td>
                            <td>{contact.type}</td>
                            <td>{contact.email ?? 'No email'}</td>
                            <td>{contact.consentStatus}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p>No active contacts are affiliated with this organization.</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        {!visible.length ? (
          <p style={{ padding: '1.25rem' }}>
            {organizations.length
              ? 'No organizations or affiliated contacts match that search.'
              : 'No active organizations yet.'}
          </p>
        ) : null}
      </section>
      <section
        className="panel panel--flush"
        style={{ marginTop: '2rem' }}
        aria-labelledby="organization-trash-title"
      >
        <div className="panel__header" style={{ padding: '1.25rem' }}>
          <div>
            <h2 id="organization-trash-title">Trash</h2>
            <p>
              Organizations removed from their connected Sheet. Returning rows are restored
              automatically.
            </p>
          </div>
        </div>
        {trashedOrganizations.length ? (
          trashedOrganizations.map((organization) => (
            <div className="list-card" key={organization.id}>
              <div>
                <h3>{organization.name}</h3>
                <p>
                  {organization.type} · removed {new Date(organization.deletedAt).toLocaleString()}{' '}
                  · {organization._count.contacts} archived contact
                  {organization._count.contacts === 1 ? '' : 's'}
                </p>
              </div>
              <Button
                kind="ghost"
                onClick={() => void updateTrash(organization.id, 'restore')}
                renderIcon={Renew}
                size="sm"
              >
                Restore
              </Button>
            </div>
          ))
        ) : (
          <p style={{ padding: '1.25rem' }}>Trash is empty.</p>
        )}
      </section>
    </>
  );
}

function CampaignAnalyticsView({
  campaigns,
  selectedId,
  setSelectedId,
}: {
  campaigns: CampaignAnalytics[];
  selectedId: string;
  setSelectedId: (id: string) => void;
}) {
  const campaign = campaigns.find((item) => item.id === selectedId) ?? campaigns[0];
  if (!campaign)
    return (
      <InlineNotification
        hideCloseButton
        kind="info"
        lowContrast
        title="No campaigns to analyze"
        subtitle="Create a campaign and associate contacts to begin."
      />
    );
  return (
    <>
      <section className="panel">
        <label>
          <span>Campaign</span>
          <select
            className="filter-select"
            value={campaign.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {campaigns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <p>{campaign.objective}</p>
      </section>
      <section className="metric-grid" aria-label={`${campaign.name} analytics`}>
        <MetricCard
          change="associated"
          detail="campaign audience"
          direction="up"
          label="Contacts"
          value={String(campaign.contacts)}
        />
        <MetricCard
          change={`${campaign.responses} responses`}
          detail={`${campaign.delivered} delivered`}
          direction="up"
          label="Response rate"
          value={`${campaign.responseRate}%`}
        />
        <MetricCard
          change={`${campaign.positiveResponses} positive`}
          detail="of classified responses"
          direction="up"
          label="Positive rate"
          value={`${campaign.positiveResponseRate}%`}
        />
        <MetricCard
          change={`${campaign.awaitingBob} awaiting Bob`}
          detail={`${campaign.draftsReady} drafts ready`}
          direction={campaign.awaitingBob ? 'warn' : 'up'}
          label="Open follow-ups"
          value={String(campaign.followUpsOpen)}
        />
      </section>
      <section className="panel">
        <h2>Campaign database activity</h2>
        <p>
          {campaign.interactions} interactions recorded. Average response time:{' '}
          {campaign.averageResponseMinutes === null
            ? 'not enough data'
            : `${campaign.averageResponseMinutes} minutes`}
          .
        </p>
        <p>
          All metrics are calculated from records associated with this campaign; no fictional values
          are included.
        </p>
      </section>
    </>
  );
}

function RecordList({
  empty,
  rows,
}: {
  empty: string;
  rows: Array<{ id: string; primary: string; secondary: string }>;
}) {
  return (
    <section className="panel panel--flush">
      {rows.length ? (
        rows.map((row) => (
          <div className="list-card" key={row.id}>
            <div>
              <h3>{row.primary}</h3>
              <p>{row.secondary}</p>
            </div>
          </div>
        ))
      ) : (
        <p style={{ padding: '1.25rem' }}>{empty}</p>
      )}
    </section>
  );
}
