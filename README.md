# Codex Remote

スマホから、自分のPCで動いているCodexを操作するためのWebアプリです。

スマホは操作画面だけです。実行本体、ローカルファイル、Chrome、画像、スクリーンショット、Codexの作業は、すべて利用者本人のPC側で動きます。

## できること

- スマホからCodexへ指示を送る
- PC側Codexの出力をリアルタイム表示する
- 画像やスクリーンショットをスマホ側で見る
- スマホからフォルダや成果物を確認する
- PWAとしてホーム画面に追加する
- X、X Articles、noteのローカル投稿ワークフローを使う
- GitHubから更新する

## 重要な考え方

このリポジトリを使う人は、それぞれ自分のPCに入れて使います。

あなたのPCやアカウントを他人が使う形ではありません。

```text
スマホ
  -> token付きの外用URL
  -> 利用者本人のPC内のBridge
  -> 利用者本人のCodex
```

`start.bat` はCloudflare Quick Tunnelを使い、外から使えるURLだけを表示します。

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

```env
PHONE_PRODUCT_MODE=1
PHONE_TOKEN=replace-with-a-long-random-secret
PHONE_PUBLIC_URL=https://your-fixed-domain.example.com
PHONE_UI_PORT=45214
PHONE_BIND_HOST=127.0.0.1
CODEX_MODEL=gpt-5.4
```

起動:

```powershell
npm run phone:product
```

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
