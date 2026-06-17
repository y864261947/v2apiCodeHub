# v2api Code Hub

Desktop companion for connecting Codex, Claude Code, Gemini CLI, and generic OpenAI-compatible clients to v2api.

This project is intentionally separate from `new-api`. The gateway owns account, API key, model routing, billing, quota, and logs. This companion app owns local client profiles, configuration snippets, smoke tests, and later desktop-only capabilities such as tray, deep links, auto-update, local config writing, and bot bridge processes.

## MVP

- Configure a v2api endpoint, API key, model, and group.
- Generate client profiles for Codex, Claude Code, Gemini CLI, and generic OpenAI-compatible clients.
- Copy environment snippets, JSON profiles, curl smoke tests, and CC Switch import links.
- Run a basic OpenAI-compatible smoke test against `POST /v1/chat/completions`.
- Persist local profiles in browser storage for the web MVP.

## Run

```bash
bun install
bun run dev
```

Tauri files are included so the project can grow into a desktop app, but the first MVP is usable as a local web app while desktop commands are added.

Local dev URL:

```text
http://127.0.0.1:5177/
```

## What Works Now

- Multiple local profiles.
- Profile persistence in localStorage.
- v2api base URL, API key, model, and group fields.
- v2api account token field for dashboard management APIs.
- Sync from v2api:
  - API key list
  - available models
  - usable groups
- Fetch the selected real API key after user confirmation through the existing v2api key reveal API.
- Client presets:
  - Codex
  - Claude Code
  - Gemini CLI
  - generic OpenAI-compatible client
- Copyable configuration artifacts.
- CC Switch import links.
- OpenAI-compatible smoke test through `/v1/chat/completions`.
- Tauri 2 project shell for desktop packaging.

## Next MVP Steps

- Add v2api login and dedicated API key creation through `new-api` APIs.
- Add Tauri commands for writing local client config files with backup and rollback.
- Add tray and auto-update after the first packaged desktop build.
- Add optional WeChat/QQ bot bridge as a separate process or sibling service.
