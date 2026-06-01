# Security Policy

## Supported Scope

This repository is an experimental local lab. The supported security posture is:

- keep the Codex app-server bound to `127.0.0.1`
- expose only the token-protected public tunnel or fixed public URL
- treat `.phone-token`, `.uploads/`, `.codex-home*/`, and generated session databases as local-only state
- treat startup notification credentials and tokenized URL messages as private local state

## Why Codex Security Matters Here

Codex Remote deliberately sits near sensitive boundaries: a phone-accessible UI, a local Codex process, local files, browser automation, screenshots, generated artifacts, and optional public tunnel access. A mistake in authentication, token handling, file path validation, browser-control boundaries, or log redaction could expose a user's local machine or private work.

Codex Security is useful for this project because reviews can focus on:

- token validation and token rotation flows
- Cloudflare Tunnel or fixed-public-URL access control
- local file browsing and artifact serving boundaries
- browser automation permissions and command injection risks
- screenshot, upload, and media preview handling
- accidental leakage of tokens, local paths, logs, profile names, or screenshots
- safe defaults for individual users running the bridge from their own PCs

## Reporting

If you find a security issue, open a private advisory or contact the repository owner before publishing details.

## Public-Safe Checklist

- Do not commit local tokens, generated Codex homes, session databases, logs, uploads, or private screenshots.
- Do not bind `codex app-server` or the phone bridge directly to a local network or public interface without a separate authenticated access layer.
- Treat printed `?token=...` URLs as private local access keys. Do not publish them in issues, chats, screenshots, or streams.
- Stop the bridge with `Ctrl+C`; closing the terminal or restarting the PC stops the process.
- Do not expose the bridge through an unauthenticated public tunnel or raw port forward.
- Run the bridge from a normal user account, not a root/admin shell.
- Send startup notifications only to private/protected notification accounts, topics, or channels.
- Rotate `PHONE_TOKEN` or delete `.phone-token` after demos on shared networks.
- Prefer a fixed authenticated tunnel or device-authenticated access layer for ongoing external access.
