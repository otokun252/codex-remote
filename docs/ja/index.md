---
layout: home
hero:
  name: Codex Remote
  text: スマホから自分のPCのCodexを操作
  tagline: BridgeはPC内のlocalhostに閉じ、スマホはtoken付きの外用URLから接続します。
  image:
    src: /logo.svg
    alt: Codex Remote icon
  actions:
    - theme: brand
      text: GitHub導入
      link: /github-distribution-ja
    - theme: alt
      text: Phone Bridge
      link: /ja/guide/phone-bridge
features:
  - title: 外から使う前提
    details: start.batは外用トンネルを開き、QRには外用URLだけを表示します。
  - title: 実行はPC側
    details: Codex、ローカルファイル、ブラウザ、画像、スクショは利用者本人のPCに残ります。
  - title: GitHubで更新
    details: update.batで最新版を取得でき、利用者はGitコマンドを触らず更新できます。
  - title: 公開安全
    details: token、アカウント設定、アップロード、ログ、セッションDBはGitに載せません。
---

## はじめ方

```powershell
setup.bat
start.bat
```

表示されたQRコードをスマホで読み込みます。固定URLを設定している場合、QRは `PHONE_PUBLIC_URL` を向きます。

