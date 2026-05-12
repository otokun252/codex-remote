# Security Model

This project is intentionally local-first.

## Public-Safe Defaults

- The Codex app-server examples bind to `127.0.0.1`.
- The phone bridge also binds to `127.0.0.1` by default.
- Phones connect through a token-protected public URL, not through a raw local-network URL.
- Page, API, and WebSocket bridge requests require the same token.
- `.phone-token`, `.uploads/`, `.codex-home*/`, logs, and session databases stay out of Git.
- Startup notification credentials and tokenized URL messages should stay in private/protected notification accounts, topics, or channels.

## Do Not Do This

Do not bind an unauthenticated Codex app-server or bridge directly to a local network or public interface.

For remote access outside a trusted local network, prefer:

- SSH port forwarding
- a VPN
- a mesh network with device-level authentication

## Token Handling

The bridge creates `.phone-token` with mode `0600` when `PHONE_TOKEN` is not provided. Delete `.phone-token` to rotate the generated token.

## Beginner Runtime Notes

- Treat the printed `?token=...` URL like a local access key. Anyone who can open it can drive the bridge for that running session.
- Do not paste tokenized URLs into public issues, shared chats, screenshots, or streams.
- Stop the bridge with `Ctrl+C` in the terminal that is running `npm run phone`.
- Closing the terminal or restarting the PC stops the bridge. Run `npm run phone` again when you want to use it.
- Run the bridge from a normal user account, not a root/admin shell.
- Do not expose the bridge with an unauthenticated public tunnel or raw port forward. Put trusted access, such as SSH forwarding, a VPN, or a device-authenticated mesh network, in front of it.
