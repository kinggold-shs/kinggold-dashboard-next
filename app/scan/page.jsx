'use client';

import { useState, useRef, useEffect } from 'react';
import DashboardShell from '../../components/DashboardShell';
import { fn6Api } from '../../api/fn6';
import { TYPE_LABELS, TYPE_COLORS } from '../../constants/fn6';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { ScanBarcode, RotateCcw, Package } from 'lucide-react';

const DASH = '—';

function formatCurrency(v) {
  if (v == null || isNaN(v)) return DASH;
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

function Field({ label, value }) {
  return (
    <div className="scan-field">
      <span className="scan-field-label">{label}</span>
      <span className="scan-field-value">{value ?? DASH}</span>
    </div>
  );
}

export default function ScanPage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleScan = async (value) => {
    const mco = (value ?? code).trim();
    if (!mco) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fn6Api.getByMco(mco);
      setResult(res.data);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Item not found';
      setError(msg);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleScan();
  };

  const handleReset = () => {
    setCode('');
    setResult(null);
    setError('');
    inputRef.current?.focus();
  };

  const item = result;
  const typeColor = item ? (TYPE_COLORS[item.co] || 'oklch(55% 0 0)') : null;

  return (
    <DashboardShell>
      <div className="scan-page">
        <div className="scan-header animate-fadeIn">
          <div className="scan-icon-wrap">
            <ScanBarcode size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Item Scanner</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Scan or type a code to view item details</p>
          </div>
        </div>

        {/* Scan input */}
        <div className="scan-input-wrap animate-fadeIn" style={{ animationDelay: '60ms' }}>
          <div className="relative flex-1">
            <ScanBarcode size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scan barcode or type code…"
              className="scan-input"
              autoComplete="off"
              inputMode="numeric"
              disabled={loading}
            />
          </div>
          <Button onClick={() => handleScan()} disabled={!code.trim() || loading} className="scan-btn">
            {loading ? 'Looking up…' : 'Search'}
          </Button>
          {(result || error) && (
            <Button variant="ghost" size="icon" onClick={handleReset} className="shrink-0" aria-label="Reset">
              <RotateCcw size={16} />
            </Button>
          )}
        </div>

        {/* Error */}
        {error && !loading && (
          <div className="scan-error animate-slideDown">
            <Package size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Result card */}
        {item && !loading && (
          <div className="scan-result animate-fadeIn">
            <div className="scan-result-header">
              <div className="scan-result-code">
                <code>{item.mco}</code>
                <span
                  className="type-badge"
                  style={{
                    background: `color-mix(in oklch, ${typeColor} 12%, transparent)`,
                    color: typeColor,
                    border: `1px solid color-mix(in oklch, ${typeColor} 22%, transparent)`,
                  }}
                >
                  {TYPE_LABELS[item.co] || `${item.co}K`}
                </span>
              </div>
              {item.idis && <p className="scan-result-name">{item.idis}</p>}
            </div>

            <div className="scan-fields-grid">
              <Field label="Gold Price / g" value={item.gold_price != null ? formatCurrency(item.gold_price) : DASH} />
              <Field label="USD Rate" value={item.dollar != null ? `$1 = EGP ${Number(item.dollar).toFixed(2)}` : DASH} />
              <Field label="Total Weight" value={item.go_cr != null ? `${Number(item.go_cr).toFixed(3)} g` : DASH} />
              <Field label="Total Price" value={item.price != null ? formatCurrency(item.price) : DASH} />
              <Field label="Quantity" value={item.qt} />
              <Field label="Mfg / g" value={item.sal_pr && item.sal_pr !== '0' ? item.sal_pr : DASH} />
              {item.prc > 0 && <Field label="Extra Price (EGP)" value={formatCurrency(item.prc)} />}
              {item.prcus > 0 && <Field label="Extra Price (USD)" value={`$${Number(item.prcus).toFixed(2)}`} />}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
