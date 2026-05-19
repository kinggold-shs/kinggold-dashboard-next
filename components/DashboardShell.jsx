'use client';

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, LogOut, Layers, Menu, X } from 'lucide-react';

const NAV = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
];

export default function DashboardShell({ children }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="dashboard-layout">
      {/* Mobile top bar */}
      <header className="mobile-header">
        <div className="mobile-header-brand">
          <div className="sidebar-logo" aria-hidden="true" style={{ width: 28, height: 28 }}>
            <Layers size={14} strokeWidth={2.2} />
          </div>
          <span className="sidebar-brand-text" style={{ fontSize: '1rem' }}>KingGold</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="mobile-header-user">{user?.username || 'User'}</span>
          <button className="mobile-header-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setMobileOpen(false)}>
          <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div className="sidebar-brand">
                <div className="sidebar-logo"><Layers size={16} /></div>
                <span className="sidebar-brand-text">KingGold</span>
              </div>
              <button className="mobile-drawer-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <nav className="sidebar-nav">
              {NAV.map((item, i) => {
                const active = pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`sidebar-nav-item${active ? ' active' : ''}`}
                    style={{ '--i': i }}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                    <span>{item.label}</span>
                    {active && <div className="sidebar-nav-indicator" />}
                  </Link>
                );
              })}
            </nav>
            <button onClick={() => { logout(); setMobileOpen(false); }} className="sidebar-logout">
              <LogOut size={15} strokeWidth={1.8} />
              <span>Sign Out</span>
            </button>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sidebar" role="navigation" aria-label="Main navigation">
        <div className="sidebar-brand">
          <div className="sidebar-logo" aria-hidden="true">
            <Layers size={16} strokeWidth={2.2} />
          </div>
          <span className="sidebar-brand-text">KingGold</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            const active = pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`sidebar-nav-item${active ? ' active' : ''}`}
                style={{ '--i': i }}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
                {active && <div className="sidebar-nav-indicator" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-avatar" aria-hidden="true">
            {user?.username?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span className="sidebar-user-name">{user?.username || 'User'}</span>
        </div>
        <button onClick={logout} className="sidebar-logout" aria-label="Sign out">
          <LogOut size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </aside>

      <main className="main-content" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
