import { Button, InlineNotification } from '@carbon/react';

import { PageHeader } from '@/components/PageHeader';
import { contacts, followUps } from '@/lib/demo-data';

export default function OutreachPage() {
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
      <section className="panel panel--flush" aria-label="Demo outreach records">
        {contacts.slice(0, 8).map((contact) => {
          const tasks = followUps.filter((task) => task.contactId === contact.id);
          return (
            <div className="list-card" key={contact.id}>
              <div>
                <h3>{contact.name}</h3>
                <p>
                  {contact.organization} · {tasks.length} follow-up{tasks.length === 1 ? '' : 's'} ·
                  Demo email context
                </p>
              </div>
              <Button disabled kind="ghost" size="sm">
                IBM Bob demo
              </Button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
