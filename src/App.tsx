import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clipboard,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileCode2,
  FolderDown,
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
import {
  exchangeDesktopAuthCode,
  fetchTokenKey,
  fetchV2ApiCatalog,
  runSmokeTest,
} from './lib/v2api'
import { beginDesktopAuthorization, installProfileBundle, isTauriRuntime } from './lib/desktop'
import { maskSecret, normalizeBaseUrl } from './lib/url'
import type {
  ApiKeySummary,
  ClientType,
  DesktopInstallState,
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

function stateIcon(status: SyncState['status'] | SmokeTestState['status'] | DesktopInstallState['status']) {
  if (status === 'running') return <Loader2 size={15} className="spin" />
  if (status === 'success') return <CheckCircle2 size={15} />
  if (status === 'error') return <AlertCircle size={15} />
  return <RefreshCw size={15} />
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
  const [installState, setInstallState] = useState<DesktopInstallState>({
    status: 'idle',
    message: 'Not installed',
  })
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([])
  const [models, setModels] = useState<string[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])

  const activeProfile = profiles.find((profile) => profile.id === activeId) ?? profiles[0]
  const client = getClientDefinition(activeProfile.client)
  const artifacts = client.artifacts(activeProfile)
  const endpoint = client.endpoint(activeProfile)
  const selectedApiKey = apiKeys.find((item) => item.id === activeProfile.apiKeyId)
  const canRunSmokeTest = activeProfile.baseUrl.trim() !== '' && activeProfile.apiKey.trim() !== ''
  const syncSummary = `${apiKeys.length} keys / ${models.length} models / ${groups.length} groups`
  const hasGateway = activeProfile.baseUrl.trim() !== ''
  const hasAccountAuthorization =
    activeProfile.accountToken.trim() !== '' && Boolean(activeProfile.accountUserId)
  const hasApiKey = activeProfile.apiKey.trim() !== ''
  const hasModel = activeProfile.model.trim() !== ''
  const routingReady = hasApiKey && hasModel
  const setupSteps = [
    { label: 'Gateway', complete: hasGateway },
    { label: 'v2api authorization', complete: hasAccountAuthorization },
    { label: 'API key', complete: hasApiKey },
    { label: 'Model', complete: hasModel },
  ]
  const completedSteps = setupSteps.filter((step) => step.complete).length
  const nextAction = !hasGateway
    ? 'Add your v2api URL'
    : !hasAccountAuthorization
      ? 'Authorize v2api account'
      : apiKeys.length === 0 && syncState.status !== 'success'
        ? 'Sync the account catalog'
        : !hasApiKey
          ? 'Select or paste an API key'
          : !hasModel
            ? 'Choose a model'
            : smokeTest.status !== 'success'
              ? 'Test the connection'
              : 'Profile is ready'

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

  const syncCatalogForProfile = async (profile: HubProfile) => {
    setSyncState({ status: 'running', message: 'Syncing v2api account' })
    try {
      const catalog = await fetchV2ApiCatalog(profile)
      setApiKeys(catalog.apiKeys)
      setModels(catalog.models)
      setGroups(catalog.groups)

      const selectedKey =
        catalog.apiKeys.find((item) => item.id === profile.apiKeyId) ??
        catalog.apiKeys.find((item) => item.status === 1) ??
        catalog.apiKeys[0]
      const patch: Partial<HubProfile> = {}
      if (selectedKey && profile.apiKeyId !== selectedKey.id) {
        patch.apiKeyId = selectedKey.id
        patch.group = selectedKey.group || profile.group
      }
      if (catalog.models.length > 0 && !catalog.models.includes(profile.model)) {
        patch.model = catalog.models[0]
      }
      if (catalog.groups.length > 0 && !catalog.groups.some((item) => item.value === profile.group)) {
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

  const handleSyncCatalog = async () => {
    await syncCatalogForProfile(activeProfile)
  }

  const handleAuthorizeAccount = async () => {
    const state = crypto.randomUUID()
    setSyncState({ status: 'running', message: 'Waiting for browser authorization' })
    try {
      const callback = await beginDesktopAuthorization(activeProfile.baseUrl, state)
      if (callback.state !== state) throw new Error('Authorization state mismatch')

      setSyncState({ status: 'running', message: 'Completing v2api authorization' })
      const auth = await exchangeDesktopAuthCode(activeProfile, callback.code, state)
      const authorizedProfile = {
        ...activeProfile,
        accountToken: auth.accountToken,
        accountUserId: auth.accountUserId,
      }
      patchActiveProfile({
        accountToken: auth.accountToken,
        accountUserId: auth.accountUserId,
      })
      await syncCatalogForProfile(authorizedProfile)
    } catch (error) {
      setSyncState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Authorization failed',
      })
    }
  }

  const handleDesktopInstall = async () => {
    setInstallState({ status: 'running', message: 'Writing local profile bundle' })
    try {
      const result = await installProfileBundle(activeProfile, artifacts)
      setInstallState({
        status: 'success',
        message: 'Local bundle written',
        path: result.path,
        backupPath: result.backup_path,
      })
    } catch (error) {
      setInstallState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Desktop install failed',
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
            <span>Profiles and client bundles</span>
          </div>
        </div>

        <div className="sidebar-heading">
          <span>Profiles</span>
          <button className="icon-button subtle" type="button" onClick={addProfile} title="New profile">
            <Plus size={16} />
            <span className="sr-only">New profile</span>
          </button>
        </div>

        <div className="profile-list">
          {profiles.map((profile) => (
            <button
              className={`profile-item ${profile.id === activeProfile.id ? 'active' : ''}`}
              key={profile.id}
              type="button"
              onClick={() => setActiveProfileId(profile.id)}
              aria-current={profile.id === activeProfile.id ? 'true' : undefined}
            >
              <span className="profile-icon">
                <Laptop size={16} />
              </span>
              <span className="profile-copy">
                <strong>{profile.name}</strong>
                <small>{getClientDefinition(profile.client).name}</small>
              </span>
              <span className={profile.apiKey.trim() ? 'profile-dot ready' : 'profile-dot'} />
            </button>
          ))}
        </div>

        <div className="side-panel">
          <span className="side-panel-title">Setup readiness</span>
          <div className="readiness-score">
            <strong>{completedSteps}/{setupSteps.length}</strong>
            <span>{nextAction}</span>
          </div>
          <div className="readiness-list">
            {setupSteps.map((step) => (
              <span className={step.complete ? 'complete' : ''} key={step.label}>
                <CheckCircle2 size={13} />
                {step.label}
              </span>
            ))}
          </div>
        </div>

        <div className="side-panel">
          <span className="side-panel-title">Active route</span>
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
          <div className="title-stack">
            <p className="eyebrow">Client profile</p>
            <h1>{activeProfile.name}</h1>
            <p>{client.name} uses {endpoint}</p>
          </div>
          <div className="topbar-actions">
            <div className={`status-pill ${syncState.status}`} aria-live="polite">
              {stateIcon(syncState.status)}
              <span>{syncState.status === 'idle' ? syncSummary : syncState.message}</span>
            </div>
            <div className={`status-pill ${smokeTest.status}`} aria-live="polite">
              {stateIcon(smokeTest.status)}
              <span>
                {smokeTest.status === 'success'
                  ? `${smokeTest.latencyMs} ms`
                  : smokeTest.message}
              </span>
            </div>
          </div>
        </header>

        <section className="overview-grid" aria-label="Profile summary">
          <div className="overview-card">
            <span>Gateway</span>
            <strong>{hasGateway ? normalizeBaseUrl(activeProfile.baseUrl) : 'Not set'}</strong>
          </div>
          <div className="overview-card">
            <span>Credential</span>
            <strong>
              {selectedApiKey
                ? selectedApiKey.name
                : hasApiKey
                  ? maskSecret(activeProfile.apiKey)
                  : 'No API key'}
            </strong>
          </div>
          <div className="overview-card">
            <span>Model</span>
            <strong>{activeProfile.model || 'Not selected'}</strong>
          </div>
          <div className={`overview-card ${routingReady ? 'ready' : ''}`}>
            <span>Next action</span>
            <strong>{nextAction}</strong>
          </div>
        </section>

        <div className="content-grid">
          <section className="flow-column">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="step-label">Step 1</p>
                  <h2>Authorize v2api</h2>
                  <p>Open v2api in the browser, sign in, and approve this desktop app.</p>
                </div>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={deleteProfile}
                  disabled={profiles.length === 1}
                  title="Delete profile"
                  aria-label="Delete profile"
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
              </div>

              <div className={`authorization-card ${hasAccountAuthorization ? 'ready' : ''}`}>
                <div>
                  <strong>{hasAccountAuthorization ? 'v2api account authorized' : 'Browser authorization'}</strong>
                  <span>
                    {hasAccountAuthorization
                      ? `User ${activeProfile.accountUserId} can sync keys, models, and groups.`
                      : 'The browser handles registration and login. Hub receives only an authorization code.'}
                  </span>
                </div>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => void handleAuthorizeAccount()}
                  disabled={!isTauriRuntime() || syncState.status === 'running'}
                  title={isTauriRuntime() ? 'Open v2api authorization' : 'Available in the desktop app'}
                >
                  {syncState.status === 'running' ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <ExternalLink size={16} />
                  )}
                  {hasAccountAuthorization ? 'Re-authorize' : 'Authorize in browser'}
                </button>
              </div>

              <details className="advanced-auth">
                <summary>Advanced manual token</summary>
                <div className="form-grid">
                  <label>
                    <span>User ID</span>
                    <input
                      value={activeProfile.accountUserId ?? ''}
                      onChange={(event) =>
                        patchActiveProfile({
                          accountUserId: event.target.value ? Number(event.target.value) : undefined,
                        })
                      }
                      placeholder="123"
                    />
                  </label>
                  <label>
                    <span>Access token</span>
                    <input
                      value={activeProfile.accountToken}
                      onChange={(event) => patchActiveProfile({ accountToken: event.target.value })}
                      placeholder="System access token"
                      type="password"
                    />
                  </label>
                </div>
              </details>

              <div className="action-row">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={handleSyncCatalog}
                  disabled={!hasAccountAuthorization || syncState.status === 'running'}
                >
                  {syncState.status === 'running' ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <Database size={16} />
                  )}
                  Sync account
                </button>
                <div className={`inline-status ${syncState.status}`} aria-live="polite">
                  {stateIcon(syncState.status)}
                  <span>{syncState.message}</span>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="step-label">Step 2</p>
                  <h2>Choose routing</h2>
                  <p>Select the key, model, and group that this local client should use.</p>
                </div>
              </div>

              <div className="metric-row">
                <div>
                  <strong>{apiKeys.length}</strong>
                  <span>API keys</span>
                </div>
                <div>
                  <strong>{models.length}</strong>
                  <span>Models</span>
                </div>
                <div>
                  <strong>{groups.length}</strong>
                  <span>Groups</span>
                </div>
              </div>

              <div className="form-grid">
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

              <div className="route-summary">
                <KeyRound size={16} />
                <span>
                  {selectedApiKey
                    ? `${selectedApiKey.name} routes to ${activeProfile.group || 'default'}`
                    : activeProfile.apiKey
                      ? `Manual key ${maskSecret(activeProfile.apiKey)}`
                      : 'No key selected yet'}
                </span>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="step-label">Step 3</p>
                  <h2>Install and verify</h2>
                  <p>Write a local bundle in the desktop app, then confirm the model answers.</p>
                </div>
              </div>

              <div className="command-grid">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={handleDesktopInstall}
                  disabled={!isTauriRuntime()}
                  title={
                    isTauriRuntime()
                      ? 'Write a local profile bundle'
                      : 'Available in the desktop app'
                  }
                >
                  {installState.status === 'running' ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <FolderDown size={16} />
                  )}
                  Desktop install
                </button>
                <button
                  className="primary-action"
                  type="button"
                  onClick={handleSmokeTest}
                  disabled={!canRunSmokeTest}
                >
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
                      `${client.name}\nEndpoint: ${endpoint}\nModel: ${
                        activeProfile.model
                      }`
                    )
                  }
                >
                  <Clipboard size={16} />
                  {copiedKey === 'endpoint' ? 'Copied' : 'Copy endpoint'}
                </button>
              </div>

              <div className={`test-output ${installState.status}`} aria-live="polite">
                <FolderDown size={16} />
                <span>
                  {installState.status === 'success'
                    ? `${installState.path}${
                        installState.backupPath ? ` (backup: ${installState.backupPath})` : ''
                      }`
                    : installState.message}
                </span>
              </div>
              <div className={`test-output ${smokeTest.status}`} aria-live="polite">
                <MessageSquare size={16} />
                <span>{smokeTest.message}</span>
              </div>
            </section>
          </section>

          <section className="panel artifact-panel">
            <div className="panel-header">
              <div>
                <p className="step-label">Generated output</p>
                <h2>{client.name}</h2>
                <p>{endpoint}</p>
              </div>
            </div>

            <div className="client-tabs" role="tablist" aria-label="Client type">
              {CLIENTS.map((item) => (
                <button
                  key={item.id}
                  className={item.id === activeProfile.client ? 'active' : ''}
                  type="button"
                  onClick={() => patchActiveProfile({ client: item.id })}
                >
                  <Bot size={15} />
                  {item.name}
                </button>
              ))}
            </div>

            <div className="artifact-overview">
              <div>
                <FileCode2 size={17} />
                <span>{artifacts.length} files</span>
              </div>
              <ArrowRight size={16} />
              <strong>{routingReady ? activeProfile.model : nextAction}</strong>
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
                      aria-label={`Copy ${artifact.title}`}
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
