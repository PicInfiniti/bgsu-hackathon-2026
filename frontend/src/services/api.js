async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('Cannot reach the backend. Check that FastAPI is running and try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail.map((error) => `${error.loc.slice(1).join(' ')}: ${error.msg}`).join('. ')
      : typeof detail === 'string' ? detail : 'The request failed. Please try again.';
    throw new Error(message);
  }
  if (!body) throw new Error('The backend returned an unexpected response. Please try again.');
  return body;
}

export const getHealth = () => request('/health');
export const previewTrip = (trip) => request('/trips/preview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(trip),
});
