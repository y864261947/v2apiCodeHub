import type { HubProfile } from '../types'

const STORAGE_KEY = 'v2api-code-hub-profiles'
const ACTIVE_KEY = 'v2api-code-hub-active-profile'

export function createDefaultProfile(): HubProfile {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: 'v2api Codex',
    baseUrl: 'https://v2api.top',
    accountToken: '',
    accountUserId: undefined,
    apiKey: '',
    apiKeyId: undefined,
    model: 'gpt-5-codex',
    group: 'auto',
    client: 'codex',
    createdAt: now,
    updatedAt: now,
  }
}

export function loadProfiles(): HubProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [createDefaultProfile()]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return [createDefaultProfile()]
    return parsed
  } catch {
    return [createDefaultProfile()]
  }
}

export function saveProfiles(profiles: HubProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

export function loadActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveProfileId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
}
