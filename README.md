# Codex Remote

Codex Remote is a local-first web app that lets a user control **their own PC's Codex** from a phone.

Each user runs the bridge on their own Windows PC. The phone UI is only a remote control screen. Codex execution, local files, browser sessions, screenshots, and generated artifacts stay on that user's PC.

## What This Is

- Phone-friendly PWA for sending instructions to Codex
- Local PC bridge for Codex app-server
- QR pairing for the phone
- Saved connection profile on the phone for return access
- WebSocket live output
- Multi-device viewing on the same Bridge
- Screenshot and image artifact preview on the phone
- Folder/artifact browsing from the phone
- Optional X/note local publishing workflows
- GitHub-based install and update flow

## Privacy Model

This repository must not contain a real user's private account names, tokens, local paths, screenshots, or credentials.

Local-only files are ignored by Git:

- `.env`
- `.phone-token`
- `.uploads/`
- `.x-profiles/`
- `tmp/`
- `connection.html`
- `connection.txt`
- `connection-qr*.png`
- `config/x-accounts.local.json`

For X/note workflows, copy `config/x-accounts.example.json` to `config/x-accounts.local.json` and put each user's own account/profile mapping there. Do not commit that local file.

## Requirements

- Windows 10/11
- Node.js LTS
- Git
- Codex CLI login on that PC
- A phone browser, preferably installed to the home screen as a PWA

## Install From GitHub

Replace the repository URL with your public GitHub repository URL.

```powershell
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO
setup.bat
```

If Windows blocks the script, run PowerShell as the user and execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
```

## Start

Double-click:

```text
start.bat
```

The start window must stay open while using Codex Remote. A QR code and URL will appear.

By default `start.bat` uses a Cloudflare Quick Tunnel so the phone can connect from outside the local network. Same-Wi-Fi URLs are not shown or required. Quick Tunnel URLs can change after restart. For a stable customer setup, configure a fixed Cloudflare Named Tunnel or another fixed public URL.

## Phone Setup

1. Start the bridge on the PC.
2. Scan the QR code from the phone.
3. Open the phone UI.
4. Add it to the home screen.
5. Next time, open it from the home screen.

If the PC bridge is stopped, the phone will show a disconnected/reconnecting state. Start the bridge again on the PC.

The phone is only the control screen. Execution stays on the Windows PC. If the phone drops offline, the PC-side Codex run can continue and the phone can resync after reconnect.

## Reconnect Behavior

- If the phone connection drops but the same Bridge URL is still alive, the app reconnects automatically.
- If the PC Bridge is restarted and the Quick Tunnel URL changes, the old URL cannot magically recover. Scan the new QR or open the new URL from the PC.
- Fixed URL mode is recommended for repeat use, PWA home-screen reopen, and customer distribution.

## Multi-Device Use

- Multiple devices can connect to the same PC Bridge at the same time.
- One device can send prompts while another watches output.
- Approval requests are shared; the first approve/decline wins and the other devices are updated.
- Device presence is shown in the phone UI and in `connection.html`.

## Update

Double-click:

```text
update.bat
```

Or run:

```powershell
npm run update:windows
```

The update command pulls the latest GitHub version, installs dependencies, and runs verification. Local tokens and account mappings are preserved because they are ignored by Git.

## Optional: Start Automatically With Windows

After setup, run:

```powershell
npm run phone:install-startup
```

This registers a Windows Scheduled Task that starts the product bridge at logon.

## Fixed URL Setup

For a stable QR and home-screen icon, set these environment variables in `.env`:

```env
PHONE_PRODUCT_MODE=1
PHONE_TOKEN=replace-with-a-long-random-secret
PHONE_PUBLIC_URL=https://your-fixed-domain.example.com
PHONE_UI_PORT=45214
PHONE_BIND_HOST=127.0.0.1
CODEX_MODEL=gpt-5.4
```

Then start:

```powershell
npm run phone:product
```

Quick Tunnel is good for testing. A fixed URL is better for ongoing use.

## Optional X/note Workflows

These workflows are local to the user's PC and use that user's Chrome/profile.

1. Copy the example config:

```powershell
copy config\x-accounts.example.json config\x-accounts.local.json
```

2. Edit `config/x-accounts.local.json`:

```json
{
  "main": {
    "handle": "@your_account",
    "chromeProfile": "Default"
  }
}
```

3. Use the phone UI or commands such as:

```powershell
npm run x:post -- --account main --text "Hello"
npm run note:draft -- --account main --title "Title" --body "Body"
```

Do not commit `config/x-accounts.local.json`.

## Developer Commands

```powershell
npm run check
npm test
npm run phone
npm run phone:tunnel
npm run phone:product
```

## Distribution Notes

For GitHub-only distribution:

1. Publish this repository.
2. Tell users to install Git, Node.js LTS, and Codex CLI.
3. Users clone the repository.
4. Users run `setup.bat`.
5. Users run `start.bat`.
6. Users scan their own QR code.
7. Users update with `update.bat`.

No shared account is required. Each user controls only their own PC's Codex.
