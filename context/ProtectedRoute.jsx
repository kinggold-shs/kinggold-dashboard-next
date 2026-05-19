'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({ children }) {
  const { token } = useAuth();
  const router = useRouter();

  if (!token) {
    router.replace('/login');
    return null;
  }

  return children;
}
