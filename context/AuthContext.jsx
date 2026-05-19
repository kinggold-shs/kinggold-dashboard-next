'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('kg_user');
      setUser(stored ? JSON.parse(stored) : null);
    } catch {
      localStorage.removeItem('kg_user');
      setUser(null);
    }
    setToken(localStorage.getItem('kg_token'));
  }, []);

  const login = (newToken, userData) => {
    localStorage.setItem('kg_token', newToken);
    localStorage.setItem('kg_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('kg_token');
    localStorage.removeItem('kg_user');
    setToken(null);
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
