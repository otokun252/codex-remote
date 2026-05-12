# 固定URL運用

Quick Tunnelは試験用です。再起動やPC停止でURLが変わることがあります。

日常利用や商品提供では、固定URLを用意して、そのURLをスマホの入口にします。

## 目標

```text
スマホ
  -> https://your-fixed-domain.example.com
  -> Cloudflare Named Tunnelなど
  -> 利用者本人のPC 127.0.0.1:45214
  -> Codex Remote
```

## 1. 固定URLを用意する

Cloudflare Named Tunnel、独自リバースプロキシ、または同等の固定URLサービスを使います。

Cloudflare Named Tunnelを使う場合の考え方:

```text
固定ドメイン
  -> cloudflared tunnel
  -> http://127.0.0.1:45214
```

Codex Remote本体は外部に直接bindしません。PC内の `127.0.0.1` だけで待ち受けます。

## 2. `.env` を作る

固定URLが決まったら、PC側で実行します。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\configure-fixed-url.ps1 -PublicUrl https://your-fixed-domain.example.com
```

このコマンドは `.env` を作ります。`.env` はGitHubに公開しません。

## 3. 監視付きで起動する

```powershell
start-product.bat
```

または:

```powershell
npm run phone:supervise
```

監視役がBridgeを起動し、落ちた場合は再起動します。

## 4. Windows起動時に自動起動する

```powershell
npm run phone:install-startup
```

これでWindowsログオン時に監視付きBridgeが起動します。

## 5. QRコード

固定URL運用では、QRコードは固定URLを向きます。

```text
connection.html
connection-qr-latest.png
connection.txt
```

更新しても `PHONE_PUBLIC_URL` と `PHONE_TOKEN` を変えなければ、スマホ側の入口は変わりません。

## 注意

- `.env` をGitHubに入れない
- `PHONE_TOKEN` を他人に見せない
- セッション状態は既定で `%LOCALAPPDATA%\CodexRemote\phone-state\state.json` に保存される
- 顧客ごとに別PC、別token、別固定URLを使う
- PC本体が完全に停止している間はCodex Remoteも動かない
- 一時URLの `trycloudflare.com` は商品用に使わない
