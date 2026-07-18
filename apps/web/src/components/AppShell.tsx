'use client';

import {
  Analytics,
  Asleep,
  Bullhorn,
  Dashboard,
  DataBase,
  Enterprise,
  Email,
  Light,
  Notification,
  Search,
  Settings,
  Task,
  UserMultiple,
} from '@carbon/icons-react';
import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  SideNav,
  SideNavItems,
  SideNavLink,
  SideNavMenu,
  SkipToContent,
  Theme,
} from '@carbon/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LighthouseMark } from './LighthouseMark';
import { ConnectedWorkspaceRecords } from './ConnectedWorkspaceRecords';
import { ConnectedSettings } from './ConnectedSettings';
import { PageHeader } from './PageHeader';

const primaryNav = [
  { href: '/dashboard', label: 'Dashboard', icon: Dashboard },
  { href: '/contacts', label: 'Contacts', icon: UserMultiple },
  { href: '/organizations', label: 'Organizations', icon: Enterprise },
  { href: '/campaigns', label: 'Campaigns', icon: Bullhorn },
  { href: '/outreach', label: 'Outreach', icon: Email },
  { href: '/follow-ups', label: 'Follow-ups', icon: Task, badge: '18' },
  { href: '/analytics', label: 'Analytics', icon: Analytics },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [dark, setDark] = useState(false);
  const [identity, setIdentity] = useState({
    authenticated: false,
    fallback: false,
    loaded: false,
    name: 'Guest',
  });

  useEffect(() => {
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result: { authenticated?: boolean; mode?: string; user?: { name?: string } }) => {
        setIdentity({
          authenticated: Boolean(result.authenticated),
          fallback: result.mode === 'FALLBACK',
          loaded: true,
          name: result.user?.name ?? 'Guest',
        });
      })
      .catch(() => setIdentity((current) => ({ ...current, loaded: true })));
  }, []);

  useEffect(() => {
    const themeTimer = window.setTimeout(() => {
      const saved = window.localStorage.getItem('faro-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDark(saved ? saved === 'dark' : prefersDark);
    }, 0);
    return () => window.clearTimeout(themeTimer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  function toggleTheme() {
    setDark((current) => {
      const next = !current;
      window.localStorage.setItem('faro-theme', next ? 'dark' : 'light');
      return next;
    });
  }

  return (
    <Theme theme={dark ? 'g100' : 'white'}>
      <SkipToContent />
      <Header aria-label="Faro product navigation" className="faro-header">
        <HeaderMenuButton
          aria-label={expanded ? 'Close navigation' : 'Open navigation'}
          isActive={expanded}
          onClick={() => setExpanded((value) => !value)}
        />
        <a className="faro-brand" href="/dashboard">
          <LighthouseMark size={26} />
          <span>Faro</span>
          <span className="faro-brand__beam" aria-hidden="true" />
        </a>
        <div className="header-context">
          <button
            className="workspace-switcher"
            type="button"
            aria-label="Current workspace"
            disabled
            title="Workspace switching is not configured"
          >
            <span className="workspace-switcher__label">Workspace</span>
            <span>
              {identity.authenticated
                ? `${identity.name}'s workspace`
                : identity.fallback
                  ? 'Demo fallback'
                  : 'Not connected'}
            </span>
            <span aria-hidden="true">⌄</span>
          </button>
          {identity.fallback ? <span className="header-date">Fictional preview</span> : null}
        </div>
        <HeaderGlobalBar>
          <button
            className="header-disabled-action"
            aria-label="Global search unavailable in demo"
            disabled
            type="button"
            title="Global search is planned"
          >
            <Search size={20} />
          </button>
          <button
            className="header-disabled-action"
            aria-label="Notification center preview unavailable"
            disabled
            type="button"
            title="Notification center UI is planned"
          >
            <Notification size={20} />
            <span className="notification-dot" />
          </button>
          <HeaderGlobalAction
            aria-label={dark ? 'Use light theme' : 'Use dark theme'}
            onClick={toggleTheme}
            tooltipAlignment="end"
          >
            {dark ? <Light size={20} /> : <Asleep size={20} />}
          </HeaderGlobalAction>
          <button
            className="user-avatar"
            type="button"
            aria-label={
              identity.authenticated ? `${identity.name} connected identity` : 'Sign in with Google'
            }
            onClick={() => {
              if (!identity.authenticated) window.location.assign('/api/auth/google/start');
            }}
            title={identity.authenticated ? 'Connected workspace' : 'Sign in with Google'}
          >
            {identity.name
              .split(' ')
              .slice(0, 2)
              .map((part) => part[0])
              .join('')}
          </button>
        </HeaderGlobalBar>
      </Header>

      <SideNav
        aria-label="Primary navigation"
        expanded={expanded}
        isPersistent={false}
        onOverlayClick={() => setExpanded(false)}
      >
        <SideNavItems>
          {primaryNav.map(({ href, label, icon, badge }) => (
            <SideNavLink
              href={href}
              isActive={pathname === href || pathname.startsWith(`${href}/`)}
              key={href}
              renderIcon={icon}
            >
              <span>{label}</span>
              {badge && identity.fallback ? <span className="nav-badge">{badge}</span> : null}
            </SideNavLink>
          ))}
          <SideNavMenu defaultExpanded renderIcon={DataBase} title="Integrations">
            <SideNavLink
              href="/integrations/google-sheets"
              isActive={pathname.startsWith('/integrations/google-sheets')}
            >
              Google Sheets
            </SideNavLink>
          </SideNavMenu>
          <SideNavMenu defaultExpanded renderIcon={Settings} title="Settings">
            <SideNavLink href="/settings/ai" isActive={pathname === '/settings/ai'}>
              IBM Bob
            </SideNavLink>
            <SideNavLink
              href="/settings/notifications"
              isActive={pathname === '/settings/notifications'}
            >
              Notifications
            </SideNavLink>
            <SideNavLink href="/settings/workspace" isActive={pathname === '/settings/workspace'}>
              Workspace
            </SideNavLink>
          </SideNavMenu>
        </SideNavItems>
        <div className="side-status">
          <span className="signal-pulse" aria-hidden="true" />
          <span>
            <strong>
              {identity.authenticated
                ? 'Connected workspace'
                : identity.fallback
                  ? 'Demo fallback'
                  : 'Workspace not connected'}
            </strong>
            <small>
              {identity.authenticated
                ? 'Google-authenticated tester'
                : identity.fallback
                  ? 'OAuth failed · fictional data'
                  : 'Sign in to begin with empty data'}
            </small>
          </span>
        </div>
      </SideNav>

      <main className="product-main" id="main-content" tabIndex={-1}>
        {!identity.loaded ? (
          <div className="skeleton" style={{ height: '18rem' }} aria-label="Loading workspace" />
        ) : identity.authenticated &&
          [
            '/analytics',
            '/campaigns',
            '/contacts',
            '/follow-ups',
            '/organizations',
            '/outreach',
          ].some((route) => pathname.startsWith(route)) ? (
          <ConnectedWorkspaceRecords pathname={pathname} />
        ) : identity.authenticated && pathname.startsWith('/settings/') ? (
          <ConnectedSettings pathname={pathname} />
        ) : !identity.authenticated &&
          !identity.fallback &&
          [
            '/analytics',
            '/campaigns',
            '/contacts',
            '/follow-ups',
            '/outreach',
            '/organizations',
            '/settings/',
          ].some((route) => pathname.startsWith(route)) ? (
          <div className="page-shell">
            <PageHeader
              description="Connect Google to create an empty authenticated workspace. Until then, Faro shows setup guidance without invented users, settings, or activity."
              eyebrow="Setup required"
              title="Connect your workspace"
            />
          </div>
        ) : (
          children
        )}
      </main>
    </Theme>
  );
}
