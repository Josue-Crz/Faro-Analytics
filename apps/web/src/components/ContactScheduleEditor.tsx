'use client';

import { Renew, Save } from '@carbon/icons-react';
import { Button, InlineNotification } from '@carbon/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { instantToZonedDateTimeLocal, zonedDateTimeLocalToInstant } from '@/lib/zoned-date-time';

interface CampaignOption {
  id: string;
  name: string;
  status: string;
}

interface FollowUpSchedule {
  campaign: { id: string; name: string };
  contact: { id: string };
  dueAt: string;
  id: string;
  initialAt: string;
  status: string;
}

interface PendingSchedule {
  campaignId: string;
  contactId: string;
  followUpAt?: string;
  initialAt?: string;
  mode: 'MANUAL' | 'OPTIMIZE';
  returnTo: string;
}

const PENDING_KEY = 'faro:pending-contact-schedule';

export function ContactScheduleEditor({
  campaigns,
  consentStatus,
  contactId,
  contactName,
  followUps,
  reload,
  returnTo,
  scopeCampaignId,
  source,
  timeZone,
}: {
  campaigns: CampaignOption[];
  consentStatus: string;
  contactId: string;
  contactName: string;
  followUps: FollowUpSchedule[];
  reload: () => Promise<void>;
  returnTo: string;
  scopeCampaignId?: string | null;
  source: string | null;
  timeZone: string;
}) {
  const allowedCampaigns = useMemo(
    () =>
      campaigns.filter(
        (campaign) =>
          (!scopeCampaignId || campaign.id === scopeCampaignId) &&
          campaign.status !== 'COMPLETED' &&
          campaign.status !== 'ARCHIVED',
      ),
    [campaigns, scopeCampaignId],
  );
  const [campaignId, setCampaignId] = useState(
    scopeCampaignId ??
      followUps.find((followUp) => ['OPEN', 'SNOOZED'].includes(followUp.status))?.campaign.id ??
      allowedCampaigns[0]?.id ??
      '',
  );
  const activeSchedule = followUps.find(
    (followUp) =>
      followUp.campaign.id === campaignId && ['OPEN', 'SNOOZED'].includes(followUp.status),
  );
  const [initialAt, setInitialAt] = useState(() =>
    instantToZonedDateTimeLocal(
      activeSchedule?.initialAt ?? new Date(Date.now() + 24 * 60 * 60_000),
      timeZone,
    ),
  );
  const [followUpAt, setFollowUpAt] = useState(() =>
    instantToZonedDateTimeLocal(
      activeSchedule?.dueAt ?? new Date(Date.now() + 72 * 60 * 60_000),
      timeZone,
    ),
  );
  const [message, setMessage] = useState<{
    kind: 'error' | 'info' | 'success' | 'warning';
    text: string;
  } | null>(null);
  const [working, setWorking] = useState(false);
  const eligible = consentStatus === 'OPTED_IN' || consentStatus === 'IMPLIED';
  const activeInitialAt = activeSchedule?.initialAt;
  const activeFollowUpAt = activeSchedule?.dueAt;

  useEffect(() => {
    if (!activeInitialAt || !activeFollowUpAt || working) return;
    const timer = window.setTimeout(() => {
      setInitialAt(instantToZonedDateTimeLocal(activeInitialAt, timeZone));
      setFollowUpAt(instantToZonedDateTimeLocal(activeFollowUpAt, timeZone));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeFollowUpAt, activeInitialAt, timeZone, working]);

  function selectCampaign(nextCampaignId: string) {
    setCampaignId(nextCampaignId);
    const saved = followUps.find(
      (followUp) =>
        followUp.campaign.id === nextCampaignId && ['OPEN', 'SNOOZED'].includes(followUp.status),
    );
    setInitialAt(
      instantToZonedDateTimeLocal(
        saved?.initialAt ?? new Date(Date.now() + 24 * 60 * 60_000),
        timeZone,
      ),
    );
    setFollowUpAt(
      instantToZonedDateTimeLocal(
        saved?.dueAt ?? new Date(Date.now() + 72 * 60 * 60_000),
        timeZone,
      ),
    );
  }

  const persist = useCallback(
    async (pending: PendingSchedule, resumed = false) => {
      setWorking(true);
      setMessage({ kind: 'info', text: 'Saving the schedule in Faro and its source row…' });
      const response = await fetch(
        `/api/contacts/${encodeURIComponent(contactId)}/schedule?returnTo=${encodeURIComponent(
          returnTo,
        )}`,
        {
          body: JSON.stringify(
            pending.mode === 'OPTIMIZE'
              ? { campaignId: pending.campaignId, mode: pending.mode }
              : {
                  campaignId: pending.campaignId,
                  followUpAt: pending.followUpAt,
                  initialAt: pending.initialAt,
                  mode: pending.mode,
                },
          ),
          headers: { 'content-type': 'application/json' },
          method: 'PUT',
        },
      );
      const result = (await response.json().catch(() => null)) as {
        data?: { dueAt: string; initialAt: string };
        message?: string;
        reconnect?: string;
        sheetWriteBack?: { status: 'NOT_APPLICABLE' | 'WRITTEN' };
      } | null;
      if (response.status === 409 && result?.reconnect && !resumed) {
        window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
        window.location.assign(result.reconnect);
        return;
      }
      if (!response.ok || !result?.data) {
        setMessage({
          kind: 'error',
          text:
            result?.message ??
            'Faro could not save both dates. No application schedule was changed.',
        });
        setWorking(false);
        return;
      }
      setInitialAt(instantToZonedDateTimeLocal(result.data.initialAt, timeZone));
      setFollowUpAt(instantToZonedDateTimeLocal(result.data.dueAt, timeZone));
      setMessage({
        kind: 'success',
        text:
          result.sheetWriteBack?.status === 'WRITTEN'
            ? 'Initial contact and follow-up are saved across Faro and the exact Google Sheet row.'
            : 'Initial contact and follow-up are saved across Faro. This contact has no Sheet source row.',
      });
      await reload();
      setWorking(false);
    },
    [contactId, reload, returnTo, timeZone],
  );

  useEffect(() => {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as PendingSchedule;
      if (pending.contactId !== contactId || pending.returnTo !== returnTo) return;
      window.sessionStorage.removeItem(PENDING_KEY);
      const timer = window.setTimeout(() => void persist(pending, true), 0);
      return () => window.clearTimeout(timer);
    } catch {
      window.sessionStorage.removeItem(PENDING_KEY);
    }
  }, [contactId, persist, returnTo]);

  function saveManual() {
    try {
      void persist({
        campaignId,
        contactId,
        followUpAt: zonedDateTimeLocalToInstant(followUpAt, timeZone),
        initialAt: zonedDateTimeLocalToInstant(initialAt, timeZone),
        mode: 'MANUAL',
        returnTo,
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Enter valid dates and times.',
      });
    }
  }

  return (
    <section
      className="contact-schedule-editor"
      aria-label={`Schedule outreach for ${contactName}`}
    >
      <div className="contact-schedule-editor__heading">
        <div>
          <strong>Initial contact + follow-up schedule</strong>
          <p>
            Times use {timeZone}. The optimizer starts from the current day and time whenever it
            runs.
          </p>
        </div>
        {activeSchedule ? (
          <span className="status-badge status-badge--clear">
            {activeSchedule.status.toLocaleLowerCase('en-US')}
          </span>
        ) : null}
      </div>
      {!eligible ? (
        <InlineNotification
          hideCloseButton
          kind="warning"
          lowContrast
          title="Confirm an outreach basis before assigning contact dates."
        />
      ) : !allowedCampaigns.length ? (
        <InlineNotification
          hideCloseButton
          kind="warning"
          lowContrast
          title="Create or open an active campaign before assigning dates."
        />
      ) : (
        <>
          <div className="contact-schedule-editor__grid">
            <label>
              <span>Campaign</span>
              <select
                className="filter-select"
                disabled={working || Boolean(scopeCampaignId)}
                onChange={(event) => selectCampaign(event.target.value)}
                value={campaignId}
              >
                {allowedCampaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <strong>Initial contact date and time</strong>
              <input
                disabled={working}
                onChange={(event) => setInitialAt(event.target.value)}
                required
                type="datetime-local"
                value={initialAt}
              />
            </label>
            <label>
              <strong>Follow-up date and time</strong>
              <input
                disabled={working}
                onChange={(event) => setFollowUpAt(event.target.value)}
                required
                type="datetime-local"
                value={followUpAt}
              />
            </label>
          </div>
          <div className="page-actions">
            <Button
              disabled={working || !campaignId}
              kind="secondary"
              onClick={() =>
                void persist({
                  campaignId,
                  contactId,
                  mode: 'OPTIMIZE',
                  returnTo,
                })
              }
              renderIcon={Renew}
              size="sm"
            >
              {working ? 'Updating…' : 'Assign from current time'}
            </Button>
            <Button
              disabled={working || !campaignId || !initialAt || !followUpAt}
              onClick={saveManual}
              renderIcon={Save}
              size="sm"
            >
              Save manual dates
            </Button>
          </div>
          <p className="contact-schedule-editor__source">
            {source?.startsWith('google-sheets:')
              ? 'Saving writes both dates to this contact’s exact Google Sheet source row.'
              : 'Database-only contact: saving updates Faro and its outreach calendar.'}
          </p>
        </>
      )}
      {message ? (
        <InlineNotification hideCloseButton kind={message.kind} lowContrast title={message.text} />
      ) : null}
    </section>
  );
}
