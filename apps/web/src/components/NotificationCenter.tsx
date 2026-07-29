'use client';

import { Checkmark, Notification } from '@carbon/icons-react';
import { HeaderGlobalAction } from '@carbon/react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

interface NotificationItem {
  channel: string;
  href: string | null;
  id: string;
  message: string;
  readAt: string | null;
  scheduledFor: string;
  status: string;
  title: string;
}

const previewItems: NotificationItem[] = [
  {
    channel: 'IN_APP',
    href: '/follow-ups',
    id: 'preview-follow-up-amara',
    message: 'Harbor Summit 2026 · Share the community impact brief.',
    readAt: null,
    scheduledFor: '2026-07-28T15:30:00.000Z',
    status: 'SENT',
    title: 'Follow-up due: Amara Okafor',
  },
  {
    channel: 'SMS',
    href: '/follow-ups',
    id: 'preview-follow-up-luca',
    message: 'Community Data Collaborative · Confirm the technical workshop scope.',
    readAt: null,
    scheduledFor: '2026-07-28T16:00:00.000Z',
    status: 'PREVIEWED',
    title: 'SMS preview: Luca Bianchi follow-up',
  },
];

export function NotificationCenter({ mode }: { mode: 'connected' | 'empty' | 'preview' }) {
  const [items, setItems] = useState<NotificationItem[]>(mode === 'preview' ? previewItems : []);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(mode === 'preview' ? previewItems.length : 0);
  const container = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (mode !== 'connected') return;
    const response = await fetch('/api/notifications', { cache: 'no-store' });
    if (!response.ok) return;
    const result = (await response.json()) as {
      data: { items: NotificationItem[]; unread: number };
    };
    setItems(result.data.items);
    setUnread(result.data.unread);
  }, [mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setOpen(false);
      } else if (
        event instanceof MouseEvent &&
        container.current &&
        !container.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', close);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  async function markRead(ids?: string[]) {
    const now = new Date().toISOString();
    setItems((current) =>
      current.map((item) =>
        !ids || ids.includes(item.id) ? { ...item, readAt: item.readAt ?? now } : item,
      ),
    );
    setUnread((current) =>
      ids
        ? Math.max(
            0,
            current - items.filter((item) => ids.includes(item.id) && !item.readAt).length,
          )
        : 0,
    );
    if (mode === 'connected') {
      await fetch('/api/notifications', {
        body: JSON.stringify(ids ? { ids } : { all: true }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
    }
  }

  if (mode === 'empty') {
    return (
      <button
        aria-label="Notifications require a connected workspace"
        className="header-disabled-action"
        disabled
        title="Sign in to use notifications"
        type="button"
      >
        <Notification size={20} />
      </button>
    );
  }

  return (
    <div className="notification-center" ref={container}>
      <HeaderGlobalAction
        aria-label={`${unread} unread notification${unread === 1 ? '' : 's'}`}
        isActive={open}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void load();
        }}
        tooltipAlignment="end"
      >
        <Notification size={20} />
        {unread ? <span className="notification-center__count">{Math.min(unread, 9)}</span> : null}
      </HeaderGlobalAction>
      {open ? (
        <section
          aria-label="Notification center"
          aria-modal="false"
          className="notification-center__panel"
          role="dialog"
        >
          <div className="notification-center__header">
            <div>
              <p className="eyebrow">Internal reminders</p>
              <h2>Notifications</h2>
            </div>
            <button disabled={!unread} onClick={() => void markRead()} type="button">
              <Checkmark size={16} /> Mark all read
            </button>
          </div>
          <div className="notification-center__list">
            {items.map((item) => {
              const content = (
                <>
                  <span className="notification-center__item-meta">
                    {item.channel.replace('_', ' ')} · {item.status.toLowerCase()}
                  </span>
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                  <time dateTime={item.scheduledFor}>
                    {new Date(item.scheduledFor).toLocaleString()}
                  </time>
                </>
              );
              return item.href ? (
                <Link
                  className="notification-center__item"
                  data-unread={!item.readAt}
                  href={item.href}
                  key={item.id}
                  onClick={() => {
                    void markRead([item.id]);
                    setOpen(false);
                  }}
                >
                  {content}
                </Link>
              ) : (
                <div className="notification-center__item" data-unread={!item.readAt} key={item.id}>
                  {content}
                </div>
              );
            })}
            {!items.length ? (
              <p className="notification-center__empty">No reminders yet. You are caught up.</p>
            ) : null}
          </div>
          <Link
            className="notification-center__settings"
            href="/settings/notifications"
            onClick={() => setOpen(false)}
          >
            Notification settings
          </Link>
        </section>
      ) : null}
    </div>
  );
}
