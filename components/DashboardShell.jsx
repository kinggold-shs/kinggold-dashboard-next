'use client';

import { useAuth } from '../context/AuthContext';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Layers, ScanBarcode, ShoppingBag } from 'lucide-react';

const NAV = [
  { label: 'Dashboard', path: '/scan', icon: ScanBarcode },
  { label: 'Shopify', path: '/shopify', icon: ShoppingBag },
];

export default function DashboardShell({ children }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <div className="dashboard-layout">
      {/* Mobile top bar */}
      <header className="mobile-header">
        <div className="mobile-header-brand">
          <div className="sidebar-logo" style={{ width: 28, height: 28 }}>
            <Layers size={14} strokeWidth={2.2} />
          </div>
          <span className="sidebar-brand-text" style={{ fontSize: '1rem' }}>KingGold</span>
        </div>
        <span className="mobile-header-user">{user?.username || 'User'}</span>
      </header>

      {/* Desktop sidebar */}
      <aside className="sidebar" role="navigation" aria-label="Main navigation">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <Layers size={16} strokeWidth={2.2} />
          </div>
          <span className="sidebar-brand-text">KingGold</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            const active = pathname === item.path || pathname.startsWith(item.path + '/');
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
                {active && <div className="sidebar-nav-indicator" />}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {user?.username?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span className="sidebar-user-name">{user?.username || 'User'}</span>
        </div>
        <button onClick={logout} className="sidebar-logout" aria-label="Sign out">
          <LogOut size={15} strokeWidth={1.8} />
          <span>Sign Out</span>
        </button>
      </aside>

      <main className="main-content" id="main-content" tabIndex={-1}>
        {children}
      </main>

      {/* Bottom nav — mobile only */}
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {NAV.map((item) => {
          const active = pathname === item.path || pathname.startsWith(item.path + '/');
          const Icon = item.icon;
          return (
            <Link key={item.path} href={item.path} className={`bottom-nav-item${active ? ' active' : ''}`}>
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button className="bottom-nav-item" onClick={logout}>
          <LogOut size={22} strokeWidth={1.8} />
          <span>Sign Out</span>
        </button>
      </nav>
    </div>
  );
}
