// Demo access is a local convenience, not an account or security boundary.
export const isDemoLogin = (id, password) => id.trim() === 'demo' && password === 'demo';
export const workspaceMode = (search) => new URLSearchParams(search).get('mode') === 'demo' ? 'demo' : 'live';
