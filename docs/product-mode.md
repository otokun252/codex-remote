# Product mode

Use product mode when other people should use the phone Codex UI.

Product mode is different from the personal operator mode:

- It hides personal publishing workflows such as X, X Articles, and note.
- It keeps the QR destination stable when `PHONE_PUBLIC_URL` is configured.
- It keeps the Codex app-server and bridge local. Only the token-protected public URL is exposed.

## Stable URL and QR

Quick Tunnel URLs are temporary. They are useful for testing, but they are not product URLs.

For a product release, put a stable reverse proxy, Cloudflare Named Tunnel, or device-authenticated access URL in front of the bridge, then set:

```text
PHONE_PRODUCT_MODE=1
PHONE_TOKEN=replace-with-a-long-random-secret
PHONE_PUBLIC_URL=https://your-fixed-domain.example.com
PHONE_UI_PORT=45214
PHONE_BIND_HOST=127.0.0.1
PHONE_AUTO_PORT=1
```

Start the product bridge:

```bash
npm run phone:product
```

For daily use, start the supervised product bridge instead:

```powershell
start-product.bat
```

or:

```bash
npm run phone:supervise
```

The generated `connection.html`, `connection.txt`, and `connection-qr-latest.png` will point at `PHONE_PUBLIC_URL` with the token attached. Updating the UI or restarting the bridge can keep the same QR as long as the domain and token stay the same.

In personal Quick Tunnel mode, Codex Remote can automatically move to an open local port when an old process is still holding the default port. In product mode with a fixed public URL, the phone bridge port is treated as stable: if `PHONE_UI_PORT` is already in use, startup stops instead of silently changing the phone entrypoint.

## Configure `.env`

You can write the fixed URL settings with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\configure-fixed-url.ps1 -PublicUrl https://your-fixed-domain.example.com
```

The command creates a private `.env` file with a generated token. Do not commit `.env`.

## Updating

For updates, keep these stable:

- `PHONE_PUBLIC_URL`
- `PHONE_TOKEN`
- `PHONE_UI_PORT`
- `PHONE_BIND_HOST=127.0.0.1`

After pulling new code or changing UI files, restart `npm run phone:product`. The QR remains valid because it points to the stable public URL, not to a temporary TryCloudflare hostname.

## Phone pairing and resume

The first QR open stores the token and a generated device id in the phone browser. After the user adds the PWA to the home screen, the app can reopen `/` on the same fixed domain and restore the previous thread from the local bridge state.

The bridge stores recent device, session, task, log, and artifact metadata under `tmp/phone-state/state.json`. This file is intentionally local-only and should not be committed.

Generated images and screenshots are served through token-protected `/api/file/raw` URLs. When a new image or screenshot is registered, connected phones receive an `artifact` WebSocket event and refresh the preview.

## Windows startup

On a customer PC, register the product bridge at Windows logon:

```powershell
npm run phone:install-startup
```

The scheduled task starts `scripts/supervise-product.js` and writes logs under `tmp/startup/` and `tmp/supervisor/`. Keep `PHONE_PUBLIC_URL`, `PHONE_TOKEN`, and `PHONE_UI_PORT` stable before registering the task.

The supervisor checks the local bridge health and restarts the product bridge if it exits or becomes unreachable.

## Privacy

Do not enable personal workflow endpoints for public users. Product mode returns `404` for personal workflow APIs and removes the posting menu from the UI.

Keep these local-only:

- `.env`
- `.phone-token`
- `config/x-accounts.local.json`
- screenshots containing personal accounts
- `tmp/`
