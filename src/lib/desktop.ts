import { invoke } from '@tauri-apps/api/core'
import type { ClientArtifact, DesktopInstallResult, HubProfile } from '../types'

type InstallPayload = {
  profile: HubProfile
  artifacts: ClientArtifact[]
}

type DesktopAuthPayload = {
  baseUrl: string
  state: string
}

export type DesktopAuthCallback = {
  code: string
  state: string
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function installProfileBundle(
  profile: HubProfile,
  artifacts: ClientArtifact[]
): Promise<DesktopInstallResult> {
  if (!isTauriRuntime()) {
    throw new Error('Desktop install is only available in the Tauri app')
  }

  const payload: InstallPayload = {
    profile: {
      ...profile,
      accountToken: '',
      accountUserId: undefined,
    },
    artifacts,
  }

  return invoke<DesktopInstallResult>('install_profile_bundle', { payload })
}

export async function beginDesktopAuthorization(
  baseUrl: string,
  state: string
): Promise<DesktopAuthCallback> {
  if (!isTauriRuntime()) {
    throw new Error('Browser authorization callback is only available in the desktop app')
  }

  const payload: DesktopAuthPayload = { baseUrl, state }
  return invoke<DesktopAuthCallback>('begin_desktop_auth', { payload })
}
