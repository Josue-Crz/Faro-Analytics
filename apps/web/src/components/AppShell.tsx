'use client';

import {
  Analytics,
  Asleep,
  Bullhorn,
  Dashboard,
  DataBase,
  Enterprise,
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

const primaryNav = [
  { href: '/dashboard', label: 'Dashboard', icon: Dashboard },
  { href: '/contacts', label: 'Contacts', icon: UserMultiple },
  { href: '/organizations', label: 'Organizations', icon: Enterprise },
  { href: '/campaigns', label: 'Campaigns', icon: Bullhorn },
  { href: '/follow-ups', label: 'Follow-ups', icon: Task, badge: '18' },
  { href: '/analytics', label: 'Analytics', icon: Analytics },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [dark, setDark] = useState(false);

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
            aria-label="Workspace selector unavailable in demo"
            disabled
            title="The demo contains one workspace"
          >
            <span className="workspace-switcher__label">Workspace</span>
            <span>Northstar Programs</span>
            <span aria-hidden="true">⌄</span>
          </button>
          <span className="header-date">Jun 11 – Jul 10, 2026</span>
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
            aria-label="Jordan Lee demo identity"
            disabled
            title="Demo identity"
          >
            JL
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
              {badge ? <span className="nav-badge">{badge}</span> : null}
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
            <strong>Demo workspace</strong>
            <small>Fictional seeded data</small>
          </span>
        </div>
      </SideNav>

      <main className="product-main" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </Theme>
  );
}
