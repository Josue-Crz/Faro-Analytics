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
  InlineNotification,
  SideNav,
  SideNavItems,
  SideNavLink,
  SideNavMenu,
  SkipToContent,
  Theme,
} from '@carbon/react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';

import { LighthouseMark } from './LighthouseMark';
import { ConnectedCampaignDetail } from './ConnectedCampaignDetail';
import { ConnectedWorkspaceRecords } from './ConnectedWorkspaceRecords';
import { ConnectedSettings } from './ConnectedSettings';
import { NotificationCenter } from './NotificationCenter';
import { PageHeader } from './PageHeader';
import { WorkspaceContextBar, type WorkspaceContext } from './WorkspaceContextBar';

const primaryNav = [
  { href: '/dashboard', label: 'Dashboard', icon: Dashboard },
  { href: '/contacts', label: 'Contacts', icon: UserMultiple },
  { href: '/organizations', label: 'Organizations', icon: Enterprise },
  { href: '/campaigns', label: 'Campaigns', icon: Bullhorn },
  { href: '/outreach', label: 'Outreach', icon: Email },
  { href: '/follow-ups', label: 'Follow-ups', icon: Task, badge: '18' },
  { href: '/analytics', label: 'Analytics (Soon)', icon: Analytics },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [dark, setDark] = useState(false);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
  const [workspaceContextFailed, setWorkspaceContextFailed] = useState(false);
  const [workspaceContextLoaded, setWorkspaceContextLoaded] = useState(false);
  const [updatingWorkspaceFocus, setUpdatingWorkspaceFocus] = useState(false);
  const [identity, setIdentity] = useState({
    authenticated: false,
    fallback: false,
    loaded: false,
    name: 'Guest',
    workspaceName: 'Not connected',
  });

  useEffect(() => {
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then(
        (result: {
          authenticated?: boolean;
          mode?: string;
          user?: { name?: string };
          workspace?: { name?: string } | null;
        }) => {
          setIdentity({
            authenticated: Boolean(result.authenticated),
            fallback: result.mode === 'FALLBACK',
            loaded: true,
            name: result.user?.name ?? 'Guest',
            workspaceName: result.workspace?.name ?? 'Not connected',
          });
        },
      )
      .catch(() => setIdentity((current) => ({ ...current, loaded: true })));
  }, []);

  const loadWorkspaceContext = useCallback(async () => {
    const response = await fetch('/api/workspace/context', { cache: 'no-store' });
    if (!response.ok) throw new Error('workspace-context');
    const result = (await response.json()) as { data: WorkspaceContext };
    setWorkspaceContext(result.data);
    setWorkspaceContextFailed(false);
    setWorkspaceContextLoaded(true);
  }, []);

  useEffect(() => {
    if (!identity.loaded || !identity.authenticated) return;
    const contextTimer = window.setTimeout(() => {
      void loadWorkspaceContext().catch(() => {
        setWorkspaceContextFailed(true);
        setWorkspaceContextLoaded(true);
      });
    }, 0);
    return () => window.clearTimeout(contextTimer);
  }, [identity.authenticated, identity.loaded, loadWorkspaceContext]);

  useEffect(() => {
    const refresh = () => {
      void loadWorkspaceContext().catch(() => setWorkspaceContextFailed(true));
    };
    window.addEventListener('faro:workspace-context-changed', refresh);
    return () => window.removeEventListener('faro:workspace-context-changed', refresh);
  }, [loadWorkspaceContext]);

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

  async function updateWorkspaceFocus(campaignId: string | null) {
    setUpdatingWorkspaceFocus(true);
    try {
      const response = await fetch('/api/workspace/context', {
        body: JSON.stringify({ campaignId }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      if (!response.ok) throw new Error('workspace-focus');
      await loadWorkspaceContext();
      if (!campaignId && pathname.startsWith('/campaigns/')) router.push('/dashboard');
    } catch {
      setWorkspaceContextFailed(true);
    } finally {
      setUpdatingWorkspaceFocus(false);
    }
  }

  const campaignDetailId =
    pathname.startsWith('/campaigns/') && pathname.split('/')[2] ? pathname.split('/')[2]! : null;
  const workspaceMode = identity.authenticated
    ? 'connected'
    : identity.fallback
      ? 'preview'
      : 'empty';
  const focusedCampaign = workspaceContext?.campaign ?? null;
  const scopeKey = focusedCampaign?.id ?? 'main-workspace';
  const notificationMode = identity.authenticated
    ? workspaceContextLoaded && workspaceContext
      ? 'connected'
      : 'empty'
    : identity.fallback
      ? 'preview'
      : 'empty';

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
          <Link
            className="workspace-switcher"
            aria-label={
              focusedCampaign
                ? `Open focused campaign ${focusedCampaign.name}`
                : 'Open current workspace campaigns'
            }
            href={
              focusedCampaign
                ? `/campaigns/${encodeURIComponent(focusedCampaign.id)}`
                : '/campaigns'
            }
            title={focusedCampaign ? 'Open focused campaign' : 'Open campaign workspaces'}
          >
            <span className="workspace-switcher__label">
              {focusedCampaign ? 'Campaign focus' : 'Workspace'}
            </span>
            <span>{focusedCampaign?.name ?? identity.workspaceName}</span>
            <span aria-hidden="true">›</span>
          </Link>
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
          <NotificationCenter key={`${notificationMode}:${scopeKey}`} mode={notificationMode} />
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
              Notifications (Soon)
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
                ? focusedCampaign
                  ? 'Campaign-focused workspace'
                  : 'Connected workspace'
                : identity.fallback
                  ? 'Demo fallback'
                  : 'Workspace not connected'}
            </strong>
            <small>
              {identity.authenticated
                ? focusedCampaign
                  ? focusedCampaign.name
                  : 'Google-authenticated tester'
                : identity.fallback
                  ? 'OAuth failed · fictional data'
                  : 'Sign in to begin with empty data'}
            </small>
          </span>
        </div>
      </SideNav>

      <main className="product-main" id="main-content" tabIndex={-1}>
        <WorkspaceContextBar
          context={workspaceContext}
          failed={workspaceContextFailed}
          mode={workspaceMode}
          onUseMainWorkspace={() => void updateWorkspaceFocus(null)}
          pathname={pathname}
          updating={updatingWorkspaceFocus}
        />
        <Fragment key={scopeKey}>
          {!identity.loaded || (identity.authenticated && !workspaceContextLoaded) ? (
            <div className="skeleton" style={{ height: '18rem' }} aria-label="Loading workspace" />
          ) : identity.authenticated && workspaceContextFailed && !workspaceContext ? (
            <div className="page-shell">
              <InlineNotification
                hideCloseButton
                kind="error"
                title="Workspace focus unavailable"
                subtitle="Faro did not load unscoped data because your saved campaign assignment could not be verified."
              />
            </div>
          ) : identity.authenticated && campaignDetailId ? (
            <ConnectedCampaignDetail
              campaignId={campaignDetailId}
              focusedCampaignId={focusedCampaign?.id ?? null}
              onFocusCampaign={(id) => updateWorkspaceFocus(id)}
              updatingFocus={updatingWorkspaceFocus}
            />
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
        </Fragment>
      </main>
    </Theme>
  );
}
