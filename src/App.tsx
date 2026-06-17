import { useMemo, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  Clipboard,
  Code2,
  Copy,
  Database,
  KeyRound,
  Laptop,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Server,
  TerminalSquare,
  Trash2,
} from 'lucide-react'
import { CLIENTS, getClientDefinition } from './lib/clients'
import {
  createDefaultProfile,
  loadActiveProfileId,
  loadProfiles,
  saveActiveProfileId,
  saveProfiles,
} from './lib/profiles'
import { fetchTokenKey, fetchV2ApiCatalog, runSmokeTest } from './lib/v2api'
import { maskSecret, normalizeBaseUrl } from './lib/url'
import type {
  ApiKeySummary,
  ClientType,
  GroupOption,
  HubProfile,
  SmokeTestState,
  SyncState,
} from './types'

function updateProfile(profiles: HubProfile[], id: string, patch: Partial<HubProfile>): HubProfile[] {
  const now = new Date().toISOString()
  return profiles.map((profile) =>
    profile.id === id ? { ...profile, ...patch, updatedAt: now } : profile
  )
}

export function App() {
  const initialProfiles = useMemo(() => loadProfiles(), [])
  const [profiles, setProfiles] = useState<HubProfile[]>(initialProfiles)
  const [activeId, setActiveId] = useState(() => {
    const saved = loadActiveProfileId()
    return initialProfiles.find((profile) => profile.id === saved)?.id ?? initialProfiles[0].id
  })
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [smokeTest, setSmokeTest] = useState<SmokeTestState>({
    status: 'idle',
    message: 'Not tested',
  })
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    message: 'Not synced',
  })
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([])
  const [models, setModels] = useState<string[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])

  const activeProfile = profiles.find((profile) => profile.id === activeId) ?? profiles[0]
  const client = getClientDefinition(activeProfile.client)
  const artifacts = client.artifacts(activeProfile)

  const persistProfiles = (next: HubProfile[]) => {
    setProfiles(next)
    saveProfiles(next)
  }

  const setActiveProfileId = (id: string) => {
    setActiveId(id)
    saveActiveProfileId(id)
    setSmokeTest({ status: 'idle', message: 'Not tested' })
  }

  const patchActiveProfile = (patch: Partial<HubProfile>) => {
    persistProfiles(updateProfile(profiles, activeProfile.id, patch))
  }

  const addProfile = () => {
    const profile = createDefaultProfile()
    profile.name = `v2api Profile ${profiles.length + 1}`
    const next = [...profiles, profile]
    persistProfiles(next)
    setActiveProfileId(profile.id)
  }

  const deleteProfile = () => {
    if (profiles.length === 1) return
    const next = profiles.filter((profile) => profile.id !== activeProfile.id)
    persistProfiles(next)
    setActiveProfileId(next[0].id)
  }

  const copyText = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey(null), 1400)
  }

  const handleSmokeTest = async () => {
    setSmokeTest({ status: 'running', message: 'Testing connection' })
    try {
      const result = await runSmokeTest(activeProfile)
      setSmokeTest({
        status: 'success',
        message: result.message,
        latencyMs: result.latencyMs,
      })
    } catch (error) {
      setSmokeTest({
        status: 'error',
        message: error instanceof Error ? error.message : 'Connection failed',
      })
    }
  }

  const handleSyncCatalog = async () => {
    setSyncState({ status: 'running', message: 'Syncing v2api account' })
    try {
      const catalog = await fetchV2ApiCatalog(activeProfile)
      setApiKeys(catalog.apiKeys)
      setModels(catalog.models)
      setGroups(catalog.groups)

      const selectedKey =
        catalog.apiKeys.find((item) => item.id === activeProfile.apiKeyId) ??
        catalog.apiKeys.find((item) => item.status === 1) ??
        catalog.apiKeys[0]
      const patch: Partial<HubProfile> = {}
      if (selectedKey && activeProfile.apiKeyId !== selectedKey.id) {
        patch.apiKeyId = selectedKey.id
        patch.group = selectedKey.group || activeProfile.group
      }
      if (catalog.models.length > 0 && !catalog.models.includes(activeProfile.model)) {
        patch.model = catalog.models[0]
      }
      if (catalog.groups.length > 0 && !catalog.groups.some((item) => item.value === activeProfile.group)) {
        patch.group = catalog.groups[0].value
      }
      if (Object.keys(patch).length > 0) patchActiveProfile(patch)

      setSyncState({
        status: 'success',
        message: `${catalog.apiKeys.length} keys, ${catalog.models.length} models, ${catalog.groups.length} groups`,
      })
    } catch (error) {
      setSyncState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Sync failed',
      })
    }
  }

  const handleApiKeySelect = async (idValue: string) => {
    const id = Number(idValue)
    const selected = apiKeys.find((item) => item.id === id)
    if (!selected) return
    patchActiveProfile({
      apiKeyId: selected.id,
      group: selected.group || activeProfile.group,
    })
    setSyncState({ status: 'running', message: 'Fetching API key' })
    try {
      const key = await fetchTokenKey(activeProfile, selected.id)
      patchActiveProfile({
        apiKeyId: selected.id,
        apiKey: key,
        group: selected.group || activeProfile.group,
      })
      setSyncState({ status: 'success', message: `Selected ${selected.name}` })
    } catch (error) {
      setSyncState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch API key',
      })
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Code2 size={20} />
          </div>
          <div>
            <strong>v2api Code Hub</strong>
            <span>Desktop MVP</span>
          </div>
        </div>

        <button className="primary-action" type="button" onClick={addProfile}>
          <Plus size={16} />
          New profile
        </button>

        <div className="profile-list">
          {profiles.map((profile) => (
            <button
              className={`profile-item ${profile.id === activeProfile.id ? 'active' : ''}`}
              key={profile.id}
              type="button"
              onClick={() => setActiveProfileId(profile.id)}
            >
              <Laptop size={17} />
              <span>{profile.name}</span>
              <small>{maskSecret(profile.apiKey) || profile.client}</small>
            </button>
          ))}
        </div>

        <div className="side-panel">
          <div className="side-panel-row">
            <Server size={16} />
            <span>{normalizeBaseUrl(activeProfile.baseUrl)}</span>
          </div>
          <div className="side-panel-row">
            <KeyRound size={16} />
            <span>{maskSecret(activeProfile.apiKey) || 'No key'}</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Client profile</p>
            <h1>{activeProfile.name}</h1>
          </div>
          <div className={`status-pill ${smokeTest.status}`}>
            {smokeTest.status === 'running' ? <Loader2 size={15} className="spin" /> : null}
            {smokeTest.status === 'success' ? <CheckCircle2 size={15} /> : null}
            {smokeTest.status === 'idle' ? <RefreshCw size={15} /> : null}
            {smokeTest.status === 'error' ? <Bot size={15} /> : null}
            <span>
              {smokeTest.status === 'success'
                ? `${smokeTest.latencyMs} ms`
                : smokeTest.message}
            </span>
          </div>
        </header>

        <div className="content-grid">
          <section className="panel setup-panel">
            <div className="panel-header">
              <div>
                <h2>v2api connection</h2>
                <p>Account-owned API key, model, and routing group.</p>
              </div>
              <button
                className="icon-button danger"
                type="button"
                onClick={deleteProfile}
                disabled={profiles.length === 1}
                title="Delete profile"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="form-grid">
              <label>
                <span>Name</span>
                <input
                  value={activeProfile.name}
                  onChange={(event) => patchActiveProfile({ name: event.target.value })}
                />
              </label>
              <label>
                <span>Client</span>
                <select
                  value={activeProfile.client}
                  onChange={(event) =>
                    patchActiveProfile({ client: event.target.value as ClientType })
                  }
                >
                  {CLIENTS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                <span>v2api URL</span>
                <input
                  value={activeProfile.baseUrl}
                  onChange={(event) => patchActiveProfile({ baseUrl: event.target.value })}
                  placeholder="https://v2api.top"
                />
              </label>
              <label className="wide">
                <span>Account token</span>
                <input
                  value={activeProfile.accountToken}
                  onChange={(event) => patchActiveProfile({ accountToken: event.target.value })}
                  placeholder="Generate from v2api profile, then paste here"
                  type="password"
                />
              </label>
              <label className="wide">
                <span>API key from v2api</span>
                <select
                  value={activeProfile.apiKeyId ?? ''}
                  onChange={(event) => void handleApiKeySelect(event.target.value)}
                  disabled={apiKeys.length === 0}
                >
                  <option value="">
                    {apiKeys.length === 0 ? 'Sync v2api first' : 'Select API key'}
                  </option>
                  {apiKeys.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - {item.group || 'default'} - {item.key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                <span>API key</span>
                <input
                  value={activeProfile.apiKey}
                  onChange={(event) => patchActiveProfile({ apiKey: event.target.value })}
                  placeholder="sk-..."
                  type="password"
                />
              </label>
              <label>
                <span>Model</span>
                <input
                  value={activeProfile.model}
                  onChange={(event) => patchActiveProfile({ model: event.target.value })}
                  placeholder="gpt-5-codex"
                  list="v2api-models"
                />
                <datalist id="v2api-models">
                  {models.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
              <label>
                <span>Group</span>
                <input
                  value={activeProfile.group}
                  onChange={(event) => patchActiveProfile({ group: event.target.value })}
                  placeholder="auto"
                  list="v2api-groups"
                />
                <datalist id="v2api-groups">
                  {groups.map((group) => (
                    <option key={group.value} value={group.value}>
                      {group.desc || group.label}
                    </option>
                  ))}
                </datalist>
              </label>
            </div>

            <div className="action-row">
              <button className="secondary-action" type="button" onClick={handleSyncCatalog}>
                {syncState.status === 'running' ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Database size={16} />
                )}
                Sync v2api
              </button>
              <button className="primary-action" type="button" onClick={handleSmokeTest}>
                {smokeTest.status === 'running' ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <TerminalSquare size={16} />
                )}
                Test connection
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={() =>
                  copyText(
                    'endpoint',
                    `${client.name}\nEndpoint: ${client.endpoint(activeProfile)}\nModel: ${
                      activeProfile.model
                    }`
                  )
                }
              >
                <Clipboard size={16} />
                {copiedKey === 'endpoint' ? 'Copied' : 'Copy endpoint'}
              </button>
            </div>

            <div className={`test-output ${syncState.status}`}>
              <Database size={16} />
              <span>{syncState.message}</span>
            </div>
            <div className={`test-output ${smokeTest.status}`}>
              <MessageSquare size={16} />
              <span>{smokeTest.message}</span>
            </div>
          </section>

          <section className="panel artifact-panel">
            <div className="panel-header">
              <div>
                <h2>{client.name}</h2>
                <p>{client.endpoint(activeProfile)}</p>
              </div>
            </div>

            <div className="artifact-list">
              {artifacts.map((artifact) => (
                <article className="artifact" key={artifact.title}>
                  <div className="artifact-toolbar">
                    <div>
                      <strong>{artifact.title}</strong>
                      <span>{artifact.language}</span>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => copyText(artifact.title, artifact.value)}
                      title="Copy"
                    >
                      {copiedKey === artifact.title ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  <pre>{artifact.value}</pre>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
