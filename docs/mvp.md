# MVP Notes

## Product Boundary

`v2api-code-hub` is the user-facing desktop companion. It should not implement model routing, provider selection, quota settlement, or billing. Those remain in `new-api`.

The MVP talks to v2api as an OpenAI-compatible client:

```text
v2api Code Hub
  -> https://v2api.top/v1/chat/completions
  -> new-api routing, quota, billing, logs
  -> upstream model provider
```

## MVP Capabilities

- Configure one or more v2api profiles.
- Store a v2api account token for management API calls.
- Sync existing API keys from v2api.
- Fetch the selected real API key from v2api.
- Sync available models and usable groups from v2api.
- Generate setup snippets for Codex, Claude Code, Gemini CLI, and OpenAI-compatible clients.
- Generate CC Switch deep-link import URLs.
- In the Tauri desktop app, write a safe local profile bundle under `~/.v2api-code-hub/clients/`.
- Test a selected API key and model with a short non-streaming chat request.

## Deferred Capabilities

- Direct v2api account login.
- Dedicated API key creation from the app.
- Balance and recent usage logs.
- Direct writes to real Codex, Claude Code, and Gemini CLI config paths.
- Desktop tray, deep-link registration, and auto-update.
- WeChat/QQ bridge.

## `new-api` Integration Status

Currently used:

- list current user's API keys
- reveal key after user confirmation
- list available models
- list usable groups

Still useful for the next iteration:

- create dedicated coding API key
- return balance and recent usage logs
