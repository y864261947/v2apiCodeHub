import type { HubProfile } from '../types'
import { openAiBaseUrl } from './url'
import type { ApiKeySummary, GroupOption, V2ApiCatalog } from '../types'

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

export async function runSmokeTest(profile: HubProfile): Promise<{ message: string; latencyMs: number }> {
  const apiKey = profile.apiKey.trim()
  const model = profile.model.trim()

  if (!apiKey) throw new Error('API key is required')
  if (!model) throw new Error('Model is required')

  const start = performance.now()
  const response = await fetch(`${openAiBaseUrl(profile.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with v2api ok.' }],
      stream: false,
    }),
  })
  const latencyMs = Math.round(performance.now() - start)
  const data = (await response.json().catch(() => null)) as ChatCompletionResponse | null

  if (!response.ok) {
    const message = data?.error?.message || `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }

  const content = data?.choices?.[0]?.message?.content?.trim()
  return {
    message: content || 'Connection succeeded',
    latencyMs,
  }
}

type ApiResponse<T> = {
  success?: boolean
  message?: string
  data?: T
}

type DesktopTokenResponse = {
  user_id?: number
  userId?: number
  access_token?: string
  accessToken?: string
  token?: string
}

type PageResponse<T> = {
  items?: T[]
  total?: number
  page?: number
  page_size?: number
}

function apiUrl(profile: HubProfile, path: string): string {
  const base = profile.baseUrl.trim().replace(/\/+$/, '')
  return `${base}${path}`
}

async function requestV2Api<T>(profile: HubProfile, path: string, init?: RequestInit): Promise<T> {
  const token = profile.accountToken.trim()
  if (!token) throw new Error('v2api account token is required')

  const response = await fetch(apiUrl(profile, path), {
    ...init,
    headers: {
      Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      ...(profile.accountUserId ? { 'New-Api-User': String(profile.accountUserId) } : {}),
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null
  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`)
  }
  if (payload && payload.success === false) {
    throw new Error(payload.message || 'v2api request failed')
  }
  return payload?.data as T
}

export async function exchangeDesktopAuthCode(
  profile: HubProfile,
  code: string,
  state: string
): Promise<{ accountToken: string; accountUserId: number }> {
  const response = await fetch(apiUrl(profile, '/api/desktop/oauth/token'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client: 'v2api-code-hub',
      code,
      state,
    }),
  })
  const payload = (await response.json().catch(() => null)) as ApiResponse<DesktopTokenResponse> | null

  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`)
  }
  if (payload && payload.success === false) {
    throw new Error(payload.message || 'Desktop authorization failed')
  }

  const data = payload?.data

  const accountToken = data?.access_token ?? data?.accessToken ?? data?.token ?? ''
  const accountUserId = data?.user_id ?? data?.userId

  if (!accountToken || !accountUserId) {
    throw new Error('Authorization response did not include user id and access token')
  }

  return { accountToken, accountUserId }
}

export async function fetchApiKeys(profile: HubProfile): Promise<ApiKeySummary[]> {
  const page = await requestV2Api<PageResponse<ApiKeySummary>>(profile, '/api/token/?p=1&size=100')
  return Array.isArray(page?.items) ? page.items : []
}

export async function fetchTokenKey(profile: HubProfile, id: number): Promise<string> {
  const data = await requestV2Api<{ key?: string }>(profile, `/api/token/${id}/key`, {
    method: 'POST',
    body: '{}',
  })
  return data?.key ?? ''
}

export async function fetchUserModels(profile: HubProfile): Promise<string[]> {
  const data = await requestV2Api<string[]>(profile, '/api/user/models')
  return Array.isArray(data) ? data : []
}

export async function fetchUserGroups(profile: HubProfile): Promise<GroupOption[]> {
  const data = await requestV2Api<Record<string, { desc?: string; ratio?: string | number }>>(
    profile,
    '/api/user/self/groups'
  )
  if (!data) return []
  return Object.entries(data).map(([group, info]) => ({
    label: group,
    value: group,
    desc: info?.desc,
    ratio: info?.ratio,
  }))
}

export async function fetchV2ApiCatalog(profile: HubProfile): Promise<V2ApiCatalog> {
  const [apiKeys, models, groups] = await Promise.all([
    fetchApiKeys(profile),
    fetchUserModels(profile),
    fetchUserGroups(profile),
  ])
  return { apiKeys, models, groups }
}
