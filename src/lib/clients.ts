import type { ClientDefinition, HubProfile } from '../types'
import { normalizeBaseUrl, openAiBaseUrl } from './url'

function quoted(value: string): string {
  return JSON.stringify(value.trim())
}

function ccSwitchUrl(app: string, profile: HubProfile): string {
  const params = new URLSearchParams()
  const base = normalizeBaseUrl(profile.baseUrl)
  const endpoint = app === 'codex' ? openAiBaseUrl(profile.baseUrl) : base

  params.set('app', app)
  params.set('name', profile.name)
  params.set('endpoint', endpoint)
  params.set('apiKey', profile.apiKey.trim())
  params.set('model', profile.model.trim())
  params.set('homepage', base)
  params.set('enabled', 'true')

  return `cc-switch://import?${params.toString()}`
}

function smokeCurl(profile: HubProfile): string {
  return [
    `curl ${quoted(`${openAiBaseUrl(profile.baseUrl)}/chat/completions`)} \\`,
    `  -H ${quoted(`Authorization: Bearer ${profile.apiKey.trim()}`)} \\`,
    `  -H ${quoted('Content-Type: application/json')} \\`,
    `  -d ${quoted(
      JSON.stringify({
        model: profile.model.trim(),
        messages: [{ role: 'user', content: 'Reply with v2api ok.' }],
        stream: false,
      })
    )}`,
  ].join('\n')
}

export const CLIENTS: ClientDefinition[] = [
  {
    id: 'codex',
    name: 'Codex',
    endpoint: (profile) => openAiBaseUrl(profile.baseUrl),
    artifacts: (profile) => [
      {
        title: 'OpenAI-compatible environment',
        language: 'bash',
        value: [
          `OPENAI_API_KEY=${quoted(profile.apiKey.trim())}`,
          `OPENAI_BASE_URL=${quoted(openAiBaseUrl(profile.baseUrl))}`,
          `OPENAI_MODEL=${quoted(profile.model.trim())}`,
        ].join('\n'),
      },
      {
        title: 'CC Switch import',
        language: 'text',
        value: ccSwitchUrl('codex', profile),
      },
      {
        title: 'Smoke test',
        language: 'bash',
        value: smokeCurl(profile),
      },
    ],
  },
  {
    id: 'claude',
    name: 'Claude Code',
    endpoint: (profile) => normalizeBaseUrl(profile.baseUrl),
    artifacts: (profile) => [
      {
        title: 'Anthropic-compatible environment',
        language: 'bash',
        value: [
          `ANTHROPIC_AUTH_TOKEN=${quoted(profile.apiKey.trim())}`,
          `ANTHROPIC_BASE_URL=${quoted(normalizeBaseUrl(profile.baseUrl))}`,
          `ANTHROPIC_MODEL=${quoted(profile.model.trim())}`,
        ].join('\n'),
      },
      {
        title: 'CC Switch import',
        language: 'text',
        value: ccSwitchUrl('claude', profile),
      },
      {
        title: 'OpenAI smoke test',
        language: 'bash',
        value: smokeCurl(profile),
      },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    endpoint: (profile) => normalizeBaseUrl(profile.baseUrl),
    artifacts: (profile) => [
      {
        title: 'v2api profile',
        language: 'json',
        value: JSON.stringify(
          {
            provider: 'v2api',
            baseUrl: normalizeBaseUrl(profile.baseUrl),
            apiKey: profile.apiKey.trim(),
            model: profile.model.trim(),
            group: profile.group.trim(),
          },
          null,
          2
        ),
      },
      {
        title: 'CC Switch import',
        language: 'text',
        value: ccSwitchUrl('gemini', profile),
      },
      {
        title: 'OpenAI smoke test',
        language: 'bash',
        value: smokeCurl(profile),
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI Compatible',
    endpoint: (profile) => openAiBaseUrl(profile.baseUrl),
    artifacts: (profile) => [
      {
        title: 'Client profile',
        language: 'json',
        value: JSON.stringify(
          {
            name: profile.name,
            baseURL: openAiBaseUrl(profile.baseUrl),
            apiKey: profile.apiKey.trim(),
            model: profile.model.trim(),
          },
          null,
          2
        ),
      },
      {
        title: 'Environment',
        language: 'bash',
        value: [
          `OPENAI_API_KEY=${quoted(profile.apiKey.trim())}`,
          `OPENAI_BASE_URL=${quoted(openAiBaseUrl(profile.baseUrl))}`,
        ].join('\n'),
      },
      {
        title: 'Smoke test',
        language: 'bash',
        value: smokeCurl(profile),
      },
    ],
  },
]

export function getClientDefinition(id: string): ClientDefinition {
  return CLIENTS.find((client) => client.id === id) ?? CLIENTS[0]
}

