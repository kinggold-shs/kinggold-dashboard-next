'use client';

import { useAuth } from '../context/AuthContext';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  LogOut,
  Layers,
  ScanBarcode,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

const NAV = [
  { label: 'Dashboard', path: '/scan', icon: ScanBarcode },
  { label: 'Shopify', path: '/shopify', icon: ShoppingBag },
];

const SIDEBAR_STORAGE_KEY = 'kinggold-sidebar-collapsed';

function NavLinks({ pathname, collapsed, onNavigate }) {
  return (
    <>
      {NAV.map((item, i) => {
        const active =
          pathname === item.path || pathname.startsWith(item.path + '/');
        const Icon = item.icon;
        const link = (
          <Link
            key={item.path}
            href={item.path}
            className={`sidebar-nav-item${active ? ' active' : ''}`}
            style={{ '--i': i }}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
          >
            <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
            <span className="sidebar-label">{item.label}</span>
            {active && <div className="sidebar-nav-indicator" />}
          </Link>
        );

        if (!collapsed) return link;

        return (
          <Tooltip key={item.path}>
            <TooltipTrigger
              render={
                <span className="sidebar-nav-tooltip-anchor">{link}</span>
              }
            />
            <TooltipContent side="right" sideOffset={8}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}

export default function DashboardShell({ children }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const layoutClass = [
    'dashboard-layout',
    collapsed ? 'sidebar-collapsed' : '',
    mobileOpen ? 'sidebar-mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const sidebarFooter = (showLabels) => (
    <>
      <div className="sidebar-user">
        <div className="sidebar-user-avatar">
          {user?.username?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        {showLabels && (
          <span className="sidebar-user-name sidebar-label">
            {user?.username || 'User'}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          closeMobile();
          logout();
        }}
        className="sidebar-logout"
        aria-label="Sign out"
      >
        <LogOut size={15} strokeWidth={1.8} />
        {showLabels && <span className="sidebar-label">Sign Out</span>}
      </button>
    </>
  );

  const sidebarInner = (opts) => {
    const { collapsed: isCollapsed, showToggle, onNavigate } = opts;
    return (
      <>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <Layers size={16} strokeWidth={2.2} />
          </div>
          <span className="sidebar-brand-text sidebar-label">KingGold</span>
          {showToggle && (
            <button
              type="button"
              className="sidebar-toggle"
              onClick={toggleCollapsed}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? (
                <ChevronRight size={16} strokeWidth={2} />
              ) : (
                <ChevronLeft size={16} strokeWidth={2} />
              )}
            </button>
          )}
        </div>
        <nav className="sidebar-nav">
          <NavLinks
            pathname={pathname}
            collapsed={isCollapsed && showToggle}
            onNavigate={onNavigate}
          />
        </nav>
        {sidebarFooter(!isCollapsed || !showToggle)}
      </>
    );
  };

  return (
    <TooltipProvider delay={0}>
      <div className={layoutClass}>
        <header className="mobile-header">
          <div className="mobile-header-brand">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
            >
              <Menu size={20} strokeWidth={2} />
            </button>
            <div className="sidebar-logo" style={{ width: 28, height: 28 }}>
              <Layers size={14} strokeWidth={2.2} />
            </div>
            <span
              className="sidebar-brand-text sidebar-label"
              style={{ fontSize: '1rem' }}
            >
              KingGold
            </span>
          </div>
          <span className="mobile-header-user">{user?.username || 'User'}</span>
        </header>

        <aside
          className="sidebar sidebar-desktop"
          role="navigation"
          aria-label="Main navigation"
        >
          {sidebarInner({
            collapsed,
            showToggle: true,
            onNavigate: undefined,
          })}
        </aside>

        {mobileOpen && (
          <>
            <button
              type="button"
              className="sidebar-backdrop"
              aria-label="Close navigation menu"
              onClick={closeMobile}
            />
            <aside
              className="sidebar sidebar-drawer"
              role="navigation"
              aria-label="Mobile navigation"
            >
              <div className="sidebar-drawer-header">
                <div className="sidebar-brand sidebar-brand--drawer">
                  <div className="sidebar-logo">
                    <Layers size={16} strokeWidth={2.2} />
                  </div>
                  <span className="sidebar-brand-text">KingGold</span>
                </div>
                <button
                  type="button"
                  className="sidebar-drawer-close"
                  onClick={closeMobile}
                  aria-label="Close navigation menu"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <nav className="sidebar-nav">
                <NavLinks
                  pathname={pathname}
                  collapsed={false}
                  onNavigate={closeMobile}
                />
              </nav>
              {sidebarFooter(true)}
            </aside>
          </>
        )}

        <main className="main-content" id="main-content" tabIndex={-1}>
          {children}
        </main>

        <nav className="bottom-nav" aria-label="Mobile navigation">
          {NAV.map((item) => {
            const active =
              pathname === item.path ||
              pathname.startsWith(item.path + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`bottom-nav-item${active ? ' active' : ''}`}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button type="button" className="bottom-nav-item" onClick={logout}>
            <LogOut size={22} strokeWidth={1.8} />
            <span>Sign Out</span>
          </button>
        </nav>
      </div>
    </TooltipProvider>
  );
}
