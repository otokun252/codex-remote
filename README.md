# Codex Remote

Codex Remote is a local-first mobile control surface for Codex on a user's own PC.

It lets a phone act as the remote UI while Codex execution, local files, browser sessions, screenshots, generated artifacts, and credentials stay on the user's Windows machine. The project focuses on practical remote operation: QR pairing, PWA use, Cloudflare Tunnel access, local long-term memory workflows, artifact review, and mobile-friendly task handoff.

This is intended for individual developers and small teams who want to keep Codex running on a trusted desktop environment while monitoring and steering work from a phone.

Codex CLIの `codex remote-control` を、スマホから扱いやすくするためのリポジトリです。

スマホから、自分のPCで動いているCodexを操作するためのWebアプリです。

スマホは操作画面だけです。実行本体、ローカルファイル、Chrome、画像、スクリーンショット、Codexの作業は、すべて利用者本人のPC側で動きます。

## できること

- スマホからCodexへ指示を送る
- PC側Codexの出力をリアルタイム表示する
- 画像やスクリーンショットをスマホ側で見る
- スマホからフォルダや成果物を確認する
- PWAとしてホーム画面に追加する
- X、X Articles、noteのローカル投稿ワークフローを使う
- agentmemoryを使ってCodexにローカル長期記憶を追加する
- GitHubから更新する

## 重要な考え方

このリポジトリを使う人は、それぞれ自分のPCに入れて構築します。

あなたのPCやアカウントを他人が使う形ではありません。GitHubのリンクは、他の人にあなたの実行中URLを渡すためではなく、その人が自分のPCに同じ仕組みを作るための入口です。

```text
スマホ
  -> token付きの外用URL
  -> 利用者本人のPC内のBridge
  -> 利用者本人のCodex
```

`start.bat` はCloudflare Quick Tunnelを使い、外から使えるURLだけを表示します。

## Why This Matters for Codex OSS

Codex Remote explores an operational layer around Codex: keeping the agent close to local files and desktop tools while making it reachable from a phone. That creates a useful workflow for long-running tasks, field checks, approvals, generated artifact review, and small-business automation without moving private files or browser profiles to a hosted service.

The security boundary is central to the design: the bridge is local-first, external access is token-protected, and private runtime files are excluded from Git.

## 必要なもの

- Windows 10/11
- Node.js LTS
- Git
- Codex CLIにログイン済みのPC
- スマホ

## インストール

```powershell
git clone https://github.com/otokun252/codex-remote.git
cd codex-remote
setup.bat
```

## 起動

```powershell
start.bat
```

QRコードとURLが表示されます。スマホで読み込んでください。

起動中はPC側の起動画面を閉じないでください。PC側が止まると、スマホ側からも操作できません。

## Codex remote-control について

このプロジェクトは、Codex CLIの `remote-control` 系の使い方をスマホから扱いやすくするための構成です。

確認:

```powershell
npm run help:remote-control
npm run codex:remote-control
```

現在のスマホBridgeは、安定してスマホUIへ接続するためにローカルのCodex WebSocket互換接続を使います。`codex remote-control` を直接使いたい場合は、`.env` で次を試せます。

```text
CODEX_LAUNCH_MODE=remote-control
```

ただし環境によってはCodex公式側のremote-control登録が失敗することがあります。その場合は既定の `CODEX_LAUNCH_MODE=app-server` に戻してください。

## スマホで使う流れ

1. PCで `start.bat` を起動する
2. 表示されたQRコードをスマホで読み込む
3. スマホで画面を開く
4. ホーム画面に追加する
5. 次回からホーム画面から開く

## 更新

```powershell
update.bat
```

GitHubから最新版を取得し、必要な依存関係を更新します。

`.env`、`.phone-token`、`config/x-accounts.local.json` などのローカル設定はGitに入らないため、更新しても残ります。

## 固定URLで使う場合

Quick TunnelのURLは再起動で変わることがあります。商品として継続利用する場合は、Cloudflare Named Tunnelなどで固定URLを用意してください。

`.env` に例のように設定します。

```text
PHONE_PRODUCT_MODE=1
PHONE_TOKEN=replace-with-a-long-random-secret
PHONE_PUBLIC_URL=https://your-fixed-domain.example.com
PHONE_UI_PORT=45214
PHONE_BIND_HOST=127.0.0.1
CODEX_MODEL=gpt-5.4
PHONE_AUTO_PORT=1
```

起動:

```powershell
npm run phone:product
```

日常利用では監視付き起動を使います。Bridgeが落ちた場合、自動で再起動します。

```powershell
start-product.bat
```

固定URLの `.env` は次のコマンドでも作れます。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\configure-fixed-url.ps1 -PublicUrl https://your-fixed-domain.example.com
```

Windowsログオン時に自動起動する場合:

```powershell
npm run phone:install-startup
```

通常起動では、古いプロセスが残ってポートが塞がっていても、自動で空きポートを探します。
固定URLで使う本番モードでは、スマホの入口を勝手に変えないため、`PHONE_UI_PORT` が塞がっている場合は起動を止めます。

詳しい固定URL手順は [docs/fixed-url-ja.md](docs/fixed-url-ja.md) を見てください。

## X/note機能

X、X Articles、noteのワークフローは任意機能です。利用者ごとにローカル設定を作ります。

```powershell
copy config\x-accounts.example.json config\x-accounts.local.json
```

例:

```json
{
  "main": {
    "handle": "@your_account",
    "chromeProfile": "Default"
  }
}
```

`config/x-accounts.local.json` はGitHubに公開しないでください。

## agentmemory

agentmemoryを使うと、Codexが過去の作業や判断を思い出しやすくなります。

起動:

```powershell
start-memory.bat
```

確認:

```powershell
npm run memory:health
```

詳しくは [docs/agentmemory-ja.md](docs/agentmemory-ja.md) を見てください。

## GitHubに公開しないもの

- 本物のtoken
- 本物のX/noteアカウント名
- 個人名
- PCのローカルパス
- スクリーンショット
- `.env`
- `.phone-token`
- `tmp/`
- `.uploads/`
- `config/x-accounts.local.json`

## 開発者向け

```powershell
npm run check
npm test
npm run phone
npm run phone:product
```
