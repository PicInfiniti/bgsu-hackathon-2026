export async function loadSharedNotebook(api, storage) {
  const status = await api('/health', undefined, 'GET');
  let migrationError = '';
  try {
    const legacy = JSON.parse(storage?.getItem('picinfiniti.coach.prototype.v1') || 'null');
    if (Array.isArray(legacy) && legacy.length) {
      // Idempotent import: preserve the original copy and let SQLite keep any
      // newer edits/statuses when the same ID has already been imported.
      await api('/meetings/import', {meetings: legacy});
    }
  } catch {
    migrationError = 'Older browser notes could not be imported. Their browser copy is preserved; the shared SQLite notebook is loaded below.';
  }
  return {status, meetings: await api('/meetings', undefined, 'GET'), migrationError};
}
