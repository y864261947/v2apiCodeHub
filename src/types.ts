export type ClientType = 'codex' | 'claude' | 'gemini' | 'openai'

export type HubProfile = {
  id: string
  name: string
  baseUrl: string
  accountToken: string
  accountUserId?: number
  apiKey: string
  apiKeyId?: number
  model: string
  group: string
  client: ClientType
  createdAt: string
  updatedAt: string
}

export type ClientArtifact = {
  title: string
  language: string
  value: string
  fileName?: string
}

export type ClientDefinition = {
  id: ClientType
  name: string
  endpoint: (profile: HubProfile) => string
  artifacts: (profile: HubProfile) => ClientArtifact[]
}

export type SmokeTestState =
  | { status: 'idle'; message: string }
  | { status: 'running'; message: string }
  | { status: 'success'; message: string; latencyMs: number }
  | { status: 'error'; message: string }

export type SyncState =
  | { status: 'idle'; message: string }
  | { status: 'running'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

export type ApiKeySummary = {
  id: number
  name: string
  key: string
  status: number
  group?: string
  remain_quota: number
  used_quota: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits?: string
}

export type GroupOption = {
  label: string
  value: string
  ratio?: string | number
  desc?: string
}

export type V2ApiCatalog = {
  apiKeys: ApiKeySummary[]
  models: string[]
  groups: GroupOption[]
}

export type DesktopInstallState =
  | { status: 'idle'; message: string }
  | { status: 'running'; message: string }
  | { status: 'success'; message: string; path: string; backupPath?: string }
  | { status: 'error'; message: string }

export type DesktopInstallResult = {
  path: string
  backup_path?: string
}
