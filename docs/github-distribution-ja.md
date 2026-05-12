# GitHub構築ガイド

このリポジトリは、各ユーザーが自分のPCでCodex Remoteを動かすための構築用リポジトリです。

このGitHub URLを渡しても、あなたのPCやアカウントを相手が使う形にはなりません。相手は自分のPCにcloneして、自分のCodexで起動します。

利用者はあなたのPCやアカウントを使いません。各自が自分のPCでBridgeを起動し、自分のCodexログイン、自分のChrome、自分のローカルファイルを使います。

## 必要なもの

- Windows 10/11
- Node.js LTS
- Git
- Codex CLIにログイン済みのPC
- スマホ

## 導入手順

```powershell
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO
setup.bat
start.bat
```

`start.bat` を開くとQRコードが表示されます。スマホで読み込んで、ホーム画面に追加します。

## 外から使う前提

`start.bat` はCloudflare Quick Tunnelを使い、スマホには外から使えるURLだけを表示します。Quick TunnelのURLは再起動で変わることがあります。

継続利用や商品提供では、利用者ごとに固定URLを設定します。

```text
PHONE_PRODUCT_MODE=1
PHONE_TOKEN=replace-with-a-long-random-secret
PHONE_PUBLIC_URL=https://your-fixed-domain.example.com
PHONE_UI_PORT=45214
PHONE_BIND_HOST=127.0.0.1
PHONE_AUTO_PORT=1
```

固定URLで起動:

```powershell
npm run phone:product
```

日常利用では監視付き起動を使います。

```powershell
start-product.bat
```

固定URL用の `.env` は次でも作れます。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\configure-fixed-url.ps1 -PublicUrl https://your-fixed-domain.example.com
```

Windowsログオン時に自動起動する場合:

```powershell
npm run phone:install-startup
```

通常起動では、古いプロセスが残ってポートが塞がっていても、自動で空きポートを探します。
固定URLで使う場合は、スマホの入口を勝手に変えないため、`PHONE_UI_PORT` が塞がっていると起動を止めます。

## 更新

利用者は次を実行するだけで更新できます。

```powershell
update.bat
```

`update.bat` はGitHubから最新版を取得し、依存関係を更新し、チェックを実行します。

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

`config/x-accounts.local.json` はGitに入りません。

## agentmemoryを使う場合

agentmemoryは、Codexにローカル長期記憶を追加する任意機能です。

```powershell
start-memory.bat
```

起動確認:

```powershell
npm run memory:health
```

CodexのMCP設定例は [agentmemory連携](agentmemory-ja.md) を見てください。

## 公開してよいもの

- ソースコード
- サンプル設定
- 導入手順
- 更新手順

## 公開してはいけないもの

- 本物のtoken
- 本物のX/noteアカウント名
- 個人名
- PCのローカルパス
- スクリーンショット
- `.env`
- `.phone-token`
- `tmp/`
- `.uploads/`

