'use client';

import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { Layers } from 'lucide-react';

const PUBLIC = ['/login'];

function LoadingScreen() {
  return (
    <div className="auth-loading-screen">
      <div className="auth-loading-bg">
        <div className="auth-loading-orb orb-1" />
        <div className="auth-loading-orb orb-2" />
      </div>
      <div className="auth-loading-content">
        <div className="auth-loading-logo">
          <Layers size={28} strokeWidth={2} />
        </div>
        <span className="auth-loading-brand">KingGold</span>
        <div className="auth-loading-dots">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const { token, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC.includes(pathname);

  useEffect(() => {
    if (isLoading) return;
    if (!token && !isPublic) router.replace('/login');
    if (token && isPublic) router.replace('/scan');
  }, [isLoading, token, isPublic, router]);

  if (isLoading) return <LoadingScreen />;
  if (!token && !isPublic) return <LoadingScreen />;
  if (token && isPublic) return <LoadingScreen />;

  return children;
}
