'use client';

import { useAuth } from '../context/AuthContext';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, LogOut, Layers } from 'lucide-react';

const NAV = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
];

export default function DashboardShell({ children }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <div className="dashboard-layout">
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

        <button
          onClick={logout}
          className="sidebar-logout"
          aria-label="Sign out"
        >
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
