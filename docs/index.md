---
layout: home
hero:
  name: Codex Remote
  text: Control your own PC Codex from your phone
  tagline: The bridge stays on localhost and the phone connects through a token-protected public URL.
  image:
    src: /logo.svg
    alt: Codex Remote icon
  actions:
    - theme: brand
      text: GitHub Setup
      link: /github-distribution-ja
    - theme: alt
      text: Phone Bridge
      link: /guide/phone-bridge
features:
  - title: Outside access first
    details: The default start flow opens a Cloudflare tunnel and prints only the public QR URL.
  - title: Local execution
    details: Codex, local files, browser sessions, images, and screenshots stay on the user's PC.
  - title: Update by GitHub
    details: Users can run update.bat to pull the latest repository version without touching Git commands.
  - title: Public-safe
    details: Tokens, account mappings, uploads, logs, and session databases stay local and are ignored by Git.
---

## Quick Start

```powershell
setup.bat
start.bat
```

Scan the QR code from the phone. The QR points to the public tunnel or to `PHONE_PUBLIC_URL` when a fixed URL is configured.

## Layout

```text
phone browser
  -> token-protected public URL
  -> localhost bridge on the user's PC
  -> Codex app-server on 127.0.0.1
```

