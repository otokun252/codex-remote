# Contributing

Thanks for helping make this lab easier to reuse.

## Development

```bash
npm ci
npm run check
npm run docs:build
```

For manual bridge testing:

```bash
npm run phone
```

Open the printed QR URL from a phone. Keep both the Codex app-server and phone bridge on `127.0.0.1`; only the token-protected tunnel or fixed public URL should be reachable from outside the PC.

## Pull Requests

- Keep changes public-safe.
- Do not commit `.codex-home*`, `.phone-token`, `.uploads/`, logs, or generated session databases.
- Include a focused verification command in the PR notes.
- Update `README.md`, `README.ja.md`, or `docs/` when behavior changes.
