import { apiFetch } from '../utils/apiFetch';

export interface UserAiKey {
  provider: string;
  keyHint: string;
  createdAt: string;
}

export async function listUserAiKeys(): Promise<UserAiKey[]> {
  const res = await apiFetch('/api/user-ai-keys');
  if (!res.ok) {
    throw new Error('Failed to list AI keys');
  }
  const data = await res.json();
  return data.keys;
}

export async function saveUserAiKey(provider: string, apiKey: string): Promise<UserAiKey> {
  const res = await apiFetch(`/api/user-ai-keys/${provider}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.error || 'Failed to save key');
  }
  return res.json();
}

export async function deleteUserAiKey(provider: string): Promise<void> {
  const res = await apiFetch(`/api/user-ai-keys/${provider}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to delete key');
  }
}
