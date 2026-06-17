export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'https://v2api.top'
  return trimmed.replace(/\/+$/, '')
}

export function openAiBaseUrl(value: string): string {
  const base = normalizeBaseUrl(value)
  return base.endsWith('/v1') ? base : `${base}/v1`
}

export function maskSecret(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 12) return trimmed ? 'sk-****' : ''
  return `${trimmed.slice(0, 7)}...${trimmed.slice(-5)}`
}

