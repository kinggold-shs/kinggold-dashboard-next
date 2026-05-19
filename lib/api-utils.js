export function parseApiError(err) {
  if (!err.response?.data) return err.message || 'An unexpected error occurred';
  const data = err.response.data;
  if (typeof data === 'object') {
    const messages = Object.values(data).flat().join('; ');
    return messages || 'An error occurred';
  }
  return data.detail || data.error || String(data);
}
