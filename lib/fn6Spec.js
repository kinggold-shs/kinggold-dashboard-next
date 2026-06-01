import { TYPE_LABELS } from '../constants/fn6';

export const KG_SPEC_MARKER = '<!-- kg-spec -->';

const SPEC_LINE_PREFIXES = [
  'Gold Price / g:',
  'USD Rate:',
  'Total Weight:',
  'Total Price:',
  'Quantity:',
  'Extra Price (EGP):',
  'Extra Price (USD):',
  'Karat:',
  'SKU / Code:',
];

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

function isSpecLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (SPEC_LINE_PREFIXES.some(p => t.startsWith(p))) return true;
  if (t.startsWith('Name:')) return true;
  return false;
}

/** Marketing / product copy (default from item name). */
export function buildDefaultDescription(item) {
  return item?.idis?.trim() || '';
}

/** Plain-text spec block from Fn6 scan item. */
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
  return lines.join('\n');
}

/** Convert plain-text lines to Shopify HTML paragraphs. */
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

/** Combine description + spec for Shopify body_html. */
export function mergeToBodyHtml(description, spec) {
  const descHtml = specToBodyHtml(description);
  const specHtml = specToBodyHtml(spec);
  if (!descHtml && !specHtml) return '';
  if (!specHtml) return descHtml;
  if (!descHtml) {
    return `${KG_SPEC_MARKER}\n<h3>Specifications</h3>\n${specHtml}`;
  }
  return `${descHtml}\n${KG_SPEC_MARKER}\n<h3>Specifications</h3>\n${specHtml}`;
}

/** Split existing Shopify body_html into description and spec textareas. */
export function splitBodyHtml(html, item = null) {
  if (!html?.trim()) {
    return {
      description: item ? buildDefaultDescription(item) : '',
      spec: item ? buildDefaultSpec(item) : '',
    };
  }

  if (html.includes(KG_SPEC_MARKER)) {
    const [before, after] = html.split(KG_SPEC_MARKER);
    const specPart = after.replace(/<h3>\s*Specifications\s*<\/h3>/i, '');
    return {
      description: bodyHtmlToSpec(before).trim(),
      spec: bodyHtmlToSpec(specPart).trim() || (item ? buildDefaultSpec(item) : ''),
    };
  }

  if (/<h3>\s*Specifications\s*<\/h3>/i.test(html)) {
    const parts = html.split(/<h3>\s*Specifications\s*<\/h3>/i);
    return {
      description: bodyHtmlToSpec(parts[0]).trim(),
      spec: bodyHtmlToSpec(parts.slice(1).join('')).trim() || (item ? buildDefaultSpec(item) : ''),
    };
  }

  const plain = bodyHtmlToSpec(html);
  const lines = plain.split('\n');
  const descLines = [];
  const specLines = [];
  for (const line of lines) {
    if (isSpecLine(line)) specLines.push(line);
    else if (line.trim()) descLines.push(line);
  }

  if (specLines.length > 0) {
    return {
      description: descLines.join('\n').trim(),
      spec: specLines.join('\n').trim(),
    };
  }

  return {
    description: plain.trim(),
    spec: item ? buildDefaultSpec(item) : '',
  };
}
