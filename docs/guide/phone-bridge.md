# Phone Bridge

The phone bridge lets a phone control the Codex session running on the user's own PC.

The bridge binds to `127.0.0.1` by default. The phone connects through a token-protected public URL, either a Cloudflare tunnel created by `start.bat` or a fixed URL configured with `PHONE_PUBLIC_URL`.

## Start

```powershell
setup.bat
start.bat
```

The start window prints one QR code. Scan it from the phone and keep the start window open while using the bridge.

## Runtime Layout

```text
phone browser
  -> token-protected public URL
  -> bridge on 127.0.0.1:45214
  -> Codex app-server on ws://127.0.0.1:45213
```

The printed URL includes `?token=...`. Keep that URL private. To stop the bridge, press `Ctrl+C` in the start window.

## Stable URL

Quick Tunnel URLs can change when the bridge restarts. For customer use, configure a fixed public URL:

```text
PHONE_PRODUCT_MODE=1
PHONE_TOKEN=replace-with-a-long-random-secret
PHONE_PUBLIC_URL=https://your-fixed-domain.example.com
PHONE_UI_PORT=45214
PHONE_BIND_HOST=127.0.0.1
PHONE_AUTO_PORT=1
```

Then run:

```powershell
npm run phone:product
```

For daily use with automatic restart:

```powershell
start-product.bat
```

Quick Tunnel mode can move to an open local port when the previous run left a port busy. Fixed URL mode keeps `PHONE_UI_PORT` stable and stops if that port is occupied.

## Useful Environment Variables

```text
PHONE_UI_PORT=45214
PHONE_BIND_HOST=127.0.0.1
PHONE_TOKEN=choose-your-own-token
PHONE_PUBLIC_URL=https://your-fixed-domain.example.com
PHONE_AUTO_PORT=1
CODEX_WORKDIR=C:\path\to\project
CODEX_MODEL=gpt-5.4
PHONE_NTFY_TOPIC=your-private-topic
PHONE_PUSHOVER_TOKEN=app-token
PHONE_PUSHOVER_USER=user-key
PHONE_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Startup notifications are optional. When a public URL is ready, the bridge can send that URL to a private ntfy topic, Pushover account, or Discord webhook.

## UI Surface

- prompt input and live Codex output
- recent thread resume
- image and screenshot preview
- folder and artifact browsing
- model, plugin, config, auth, and automation lookups
- optional local X, X Articles, and note workflows

