#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfilePayload {
    id: String,
    name: String,
    base_url: String,
    api_key: String,
    api_key_id: Option<i64>,
    model: String,
    group: String,
    client: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactPayload {
    title: String,
    language: String,
    value: String,
    file_name: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct InstallPayload {
    profile: ProfilePayload,
    artifacts: Vec<ArtifactPayload>,
}

#[derive(Debug, Serialize)]
struct InstallResult {
    path: String,
    backup_path: Option<String>,
}

fn sanitize_path_part(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn bundle_root() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "failed to resolve home directory".to_string())?;
    Ok(home.join(".v2api-code-hub").join("clients"))
}

#[tauri::command]
fn install_profile_bundle(payload: InstallPayload) -> Result<InstallResult, String> {
    let profile_name = sanitize_path_part(&payload.profile.name);
    let client = sanitize_path_part(&payload.profile.client);
    if profile_name.is_empty() || client.is_empty() {
        return Err("profile name and client are required".to_string());
    }

    let target_dir = bundle_root()?.join(client).join(profile_name);
    fs::create_dir_all(&target_dir).map_err(|err| err.to_string())?;

    let bundle_path = target_dir.join("profile-bundle.json");
    let mut backup_path = None;
    if bundle_path.exists() {
        let backup = target_dir.join("profile-bundle.json.bak");
        fs::copy(&bundle_path, &backup).map_err(|err| err.to_string())?;
        backup_path = Some(backup.to_string_lossy().to_string());
    }

    let rendered = serde_json::to_string_pretty(&payload).map_err(|err| err.to_string())?;
    fs::write(&bundle_path, rendered).map_err(|err| err.to_string())?;

    for artifact in payload.artifacts {
        if let Some(file_name) = artifact.file_name {
            let safe_name = sanitize_path_part(&file_name);
            if !safe_name.is_empty() {
                fs::write(target_dir.join(safe_name), artifact.value)
                    .map_err(|err| err.to_string())?;
            }
        }
    }

    Ok(InstallResult {
        path: bundle_path.to_string_lossy().to_string(),
        backup_path,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![install_profile_bundle])
        .run(tauri::generate_context!())
        .expect("error while running v2api Code Hub");
}
