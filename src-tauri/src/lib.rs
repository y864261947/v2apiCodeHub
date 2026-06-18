use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfilePayload {
    id: String,
    name: String,
    base_url: String,
    api_key: String,
    account_user_id: Option<i64>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAuthPayload {
    base_url: String,
    state: String,
}

#[derive(Debug, Serialize)]
struct DesktopAuthCallback {
    code: String,
    state: String,
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

fn normalize_base_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char)
            }
            _ => encoded.push_str(&format!("%{:02X}", byte)),
        }
    }
    encoded
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[index + 1..index + 3]) {
                if let Ok(byte) = u8::from_str_radix(hex, 16) {
                    decoded.push(byte);
                    index += 3;
                    continue;
                }
            }
        }
        decoded.push(if bytes[index] == b'+' { b' ' } else { bytes[index] });
        index += 1;
    }
    String::from_utf8_lossy(&decoded).to_string()
}

fn query_value(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let mut parts = pair.splitn(2, '=');
        let pair_key = parts.next()?;
        let pair_value = parts.next().unwrap_or_default();
        if pair_key == key {
            Some(percent_decode(pair_value))
        } else {
            None
        }
    })
}

fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|err| err.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|err| err.to_string())?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|err| err.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn begin_desktop_auth(payload: DesktopAuthPayload) -> Result<DesktopAuthCallback, String> {
    let base_url = normalize_base_url(&payload.base_url);
    if base_url.is_empty() {
        return Err("v2api URL is required".to_string());
    }
    if payload.state.trim().is_empty() {
        return Err("authorization state is required".to_string());
    }

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|err| err.to_string())?;
    listener.set_nonblocking(true).map_err(|err| err.to_string())?;
    let port = listener.local_addr().map_err(|err| err.to_string())?.port();
    let callback_url = format!("http://127.0.0.1:{port}/auth/callback");
    let authorize_url = format!(
        "{}/desktop/authorize?client={}&callback={}&state={}",
        base_url,
        percent_encode("v2api-code-hub"),
        percent_encode(&callback_url),
        percent_encode(&payload.state)
    );

    open_browser(&authorize_url)?;

    let deadline = Instant::now() + Duration::from_secs(180);
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0; 4096];
                let size = stream.read(&mut buffer).map_err(|err| err.to_string())?;
                let request = String::from_utf8_lossy(&buffer[..size]);
                let request_line = request.lines().next().unwrap_or_default();
                let path = request_line.split_whitespace().nth(1).unwrap_or_default();
                let query = path.split_once('?').map(|(_, query)| query).unwrap_or_default();
                let code = query_value(query, "code").unwrap_or_default();
                let returned_state = query_value(query, "state").unwrap_or_default();
                let html = if !code.is_empty() && returned_state == payload.state {
                    "Authorization complete. You can return to v2api Code Hub."
                } else {
                    "Authorization failed. You can return to v2api Code Hub."
                };
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html.len(),
                    html
                );
                let _ = stream.write_all(response.as_bytes());

                if code.is_empty() {
                    return Err("authorization code was not returned".to_string());
                }
                if returned_state != payload.state {
                    return Err("authorization state mismatch".to_string());
                }
                return Ok(DesktopAuthCallback {
                    code,
                    state: returned_state,
                });
            }
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(150));
            }
            Err(err) => return Err(err.to_string()),
        }
    }

    Err("authorization timed out".to_string())
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

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            begin_desktop_auth,
            install_profile_bundle
        ])
        .run(tauri::generate_context!())
        .expect("error while running v2api Code Hub");
}
