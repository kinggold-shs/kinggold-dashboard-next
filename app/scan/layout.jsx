'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

export default function ScanLayout({ children }) {
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (token === null) {
      router.replace('/login');
    }
  }, [token, router]);

  if (token === null) return null;

  return <>{children}</>;
}
