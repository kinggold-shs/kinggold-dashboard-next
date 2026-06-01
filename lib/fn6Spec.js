import { TYPE_LABELS } from '../constants/fn6';

function formatCurrency(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain-text spec block from Fn6 scan item (for Shopify description source). */
export function buildDefaultSpec(item) {
  const lines = [];
  if (item.gold_price != null) {
    lines.push(`Gold Price / g: ${formatCurrency(item.gold_price)}`);
  }
  if (item.dollar != null) {
    lines.push(`USD Rate: $1 = EGP ${Number(item.dollar).toFixed(2)}`);
  }
  if (item.go_cr != null) {
    lines.push(`Total Weight: ${Number(item.go_cr).toFixed(3)} g`);
  }
  if (item.price != null) {
    lines.push(`Total Price: ${formatCurrency(item.price)}`);
  }
  if (item.qt != null && item.qt !== '') {
    lines.push(`Quantity: ${item.qt}`);
  }
  if (item.prc > 0) {
    lines.push(`Extra Price (EGP): ${formatCurrency(item.prc)}`);
  }
  if (item.prcus > 0) {
    lines.push(`Extra Price (USD): $${Number(item.prcus).toFixed(2)}`);
  }
  const karat = TYPE_LABELS[item.co] || (item.co != null ? `${item.co}K` : null);
  if (karat) lines.push(`Karat: ${karat}`);
  if (item.mco) lines.push(`SKU / Code: ${item.mco}`);
  if (item.idis) lines.push(`Name: ${item.idis}`);
  return lines.join('\n');
}

/** Convert plain-text spec to Shopify body_html. */
export function specToBodyHtml(text) {
  if (!text?.trim()) return '';
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join('\n');
}

/** Strip HTML from Shopify body_html for textarea editing. */
export function bodyHtmlToSpec(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
