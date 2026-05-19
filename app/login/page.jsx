'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { fn6Api } from '../../api/fn6';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Layers, Loader2, X } from 'lucide-react';

export default function LoginPage() {
  const { login, token } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) router.replace('/dashboard');
  }, [token, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    localStorage.removeItem('kg_token');
    localStorage.removeItem('kg_user');
    try {
      const res = await fn6Api.login(username, password);
      login(res.data.token, { username });
      router.replace('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-orbs" aria-hidden="true">
        <div className="login-orb orb-1" />
        <div className="login-orb orb-2" />
        <div className="login-orb orb-3" />
      </div>

      <div className="login-container">
        <div className="login-header">
          <div className="login-logo" aria-hidden="true">
            <Layers size={26} strokeWidth={2} />
          </div>
          <h1 className="login-brand">KingGold</h1>
          <p className="login-subtitle">Gold Inventory Management</p>
        </div>

        <Card className="login-card">
          <CardContent className="login-card-content">
            {error && (
              <div className="login-error" role="alert">
                <span>{error}</span>
                <button
                  className="login-error-close"
                  onClick={() => setError('')}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form" noValidate>
              <div className="login-field">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="Enter your username"
                  autoFocus
                />
              </div>
              <div className="login-field">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                />
              </div>
              <Button
                type="submit"
                disabled={!username || !password || loading}
                className="login-submit"
                size="lg"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                    Signing in…
                  </span>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="login-footer">KingGold v1.0 &middot; Gold Inventory System</p>
      </div>
    </div>
  );
}
