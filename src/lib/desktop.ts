import { invoke } from '@tauri-apps/api/core'
import type { ClientArtifact, DesktopInstallResult, HubProfile } from '../types'

type InstallPayload = {
  profile: HubProfile
  artifacts: ClientArtifact[]
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
    },
    artifacts,
  }

  return invoke<DesktopInstallResult>('install_profile_bundle', { payload })
}

