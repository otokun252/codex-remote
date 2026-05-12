# X Posting Fallback

This repository includes a local X posting path that does not depend on Codex browser-control MCP tools being present in a chat turn.

The script opens X in English by default to reduce selector drift. Override with `X_UI_LANG` only if needed.

## Account mapping

Copy `config/x-accounts.example.json` to `config/x-accounts.local.json` and set the Chrome profile for each X account.

```json
{
  "main": {
    "handle": "@main_gpt",
    "chromeProfile": "Default"
  },
  "alt": {
    "handle": "@alt_ai_naf",
    "chromeProfile": "Profile 1"
  }
}
```

## Mode 1: dedicated Playwright profile

Use this if you want a Codex-owned login session.

```bash
npm run x:login -- --account main
npm run x:login -- --account alt
```

Then post:

```bash
npm run x:post -- --account main --text-file tmp/post.txt --dry-run
npm run x:post -- --account main --text "..."
npm run x:post -- --account alt --text "..." --quote-url https://x.com/...
```

## Mode 2: existing Chrome with CDP

Use this when the user is already logged into Chrome and you want real DOM automation.

```bash
npm run x:post -- --existing --bootstrap --account main --text "..."
npm run x:post -- --existing --bootstrap --account alt --text "..." --quote-url https://x.com/...
```

This can fail if Chrome is already running without remote debugging enabled. In that case the browser ignores the new `--remote-debugging-port` flag.

The script now refuses to keep launching more Chrome windows in that state. Close existing Chrome first, or start one Chrome session with remote debugging enabled before retrying. Use `--force-bootstrap` only when you intentionally want to launch another Chrome instance.

## Mode 3: existing Chrome UIA fallback

Use this when you want the local machine to press the visible `Post` button in Chrome.

```bash
npm run x:post -- --uia --account main --text "..."
```

This opens the X compose page in the mapped Chrome profile, then uses Windows UI Automation to click the visible `Post` button.

Notes:

- `--dry-run` opens the prepared post and verifies that the `Post` button is detectable.
- `--new-window` is optional. Use it only when you explicitly want a separate Chrome window.
- UIA fallback does not support quote posts.
- X is opened with `?lang=en` and Chrome `--lang=en-US` by default.

## Mode 4: existing Chrome hotkey fallback

Use this when plain posting is enough and CDP is unavailable.

```bash
npm run x:post -- --hotkey --account main --text "..."
```

This opens the X compose page in the mapped Chrome profile, then sends `Ctrl+Enter` from PowerShell. By default it does not force a new window.

Notes:

- `--dry-run` opens the prepared post and stops before the hotkey send.
- `--send-delay-ms 9000` can be used if X loads slowly.
- `--new-window` is optional. Use it only when you explicitly want a separate Chrome window.
- Hotkey fallback does not support quote posts.
- X is opened with `?lang=en` and Chrome `--lang=en-US` by default.

## Auto fallback

Try CDP first, then fall back to the hotkey path for plain posts:

```bash
npm run x:post -- --existing --bootstrap --hotkey-fallback --account main --text "..."
```

Try CDP first, then fall back to the UIA button click path for plain posts:

```bash
npm run x:post -- --existing --bootstrap --uia-fallback --account main --text "..."
```

## Local artifacts

- A copy of each post body is saved under `tmp/x-posts/`.
- `config/x-accounts.local.json` is local-only and ignored by Git.

