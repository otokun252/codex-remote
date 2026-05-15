# Codex Remote

Codex Remote は、スマホから自分の Windows PC 上の Codex を操作するためのローカルファースト Bridge です。

スマホは操作画面です。実行本体はあなたの Windows PC 側で動きます。スマホの通信が切れても、PC 側の作業は止まりません。再接続すると履歴を同期します。

## まず何ができるか

- スマホや iPad、別ブラウザから同じ PC の Codex を開く
- QR を 1 回読んだあと、次回は PWA や同じ URL から戻る
- 実行中の作業をスマホ側で追いかける
- 生成画像、スクリーンショット、ファイル、アーティファクトを確認する
- X / note の個人ワークフローを PC 側 Chrome で動かす

## 初回セットアップ

1. Windows PC で `setup.bat` を実行します
2. その後 `start.bat` を起動します
3. PC 側に表示された QR をスマホで読みます
4. スマホで開いた画面をホーム画面に追加します

初回に保存されるもの:

- `token`
- `deviceId`
- `deviceName`
- 最後に使った `thread`
- モデル設定
- テーマ

## 一度接続したスマホから戻る方法

- 同じ URL で Bridge が生きていれば、PWA を開くだけで戻れます
- `token` が URL になくても、保存済みなら自動で再接続します
- 前回の `thread` があれば、その作業履歴を復元します

## スマホが切れたとき

- スマホの通信だけ切れた場合は、自動で再接続します
- オフライン復帰、PWA 復帰、画面再表示でも再接続を試みます
- 下書き中の本文はローカルに一時保存され、復帰時に戻します

画像添付はブラウザ再起動をまたいで保持しません。本文だけ復元されます。

## PC 側 Bridge が落ちたとき

- スマホには「PC側Bridge が起動していない可能性があります」と表示されます
- PC で `start.bat` をもう一度起動してください
- Bridge が同じ URL で戻れば、スマホは自動再接続します

## Quick Tunnel URL が変わったとき

Quick Tunnel には制約があります。

- 同じ URL のままなら、自動再接続できます
- スマホの通信だけ切れた場合も、自動再接続できます
- ただし PC 側 Bridge を再起動して Quick Tunnel の URL 自体が変わった場合は、新しい QR / URL の読み直しが必要です

この制約はスマホだけでは回避できません。継続利用や商品利用では固定 URL モードを推奨します。

## 固定URLがおすすめなケース

- 毎回 QR を読み直したくない
- PWA をホーム画面から安定して使いたい
- 複数端末から同じ Bridge に戻りたい
- 顧客配布や商品化を考えている

固定 URL を使う場合は `PHONE_PUBLIC_URL` を設定してください。

## 複数デバイスで使う方法

- iPhone と Android を同時に接続できます
- iPhone と iPad、スマホと PC ブラウザでも同時接続できます
- 片方で送信し、もう片方で出力を見ることができます
- 片方で承認した内容は、もう片方にも反映されます

接続情報画面では以下が見えます。

- 接続中の端末数
- この端末名
- 最終接続時刻
- 復元中の thread

## token をリセットする方法

スマホ側の接続情報画面から `tokenを削除してやり直す` を押します。

その後は:

1. 保存済み token が消えます
2. 次回は PC 側の新しい QR を読み直します

## 接続トラブル診断

- `token がありません`
  PC 側の QR か接続 URL を開き直してください
- `Quick Tunnel URL が変わった可能性があります`
  PC 側の `start.bat` を見て、新しい QR を読み直してください
- `PC側Bridge が起動していません`
  PC 側で `start.bat` を起動してください
- `固定URL側が切断されています`
  固定 URL のトンネル側設定を確認してください
- `前回の下書きを復元しました`
  スマホ側で送信前に切れた本文が戻っています

## 安全に使うための注意

- `connection.html`、`connection.txt`、QR 画像、`token` は他人に見せないでください
- `.env`、`.phone-token`、`.uploads`、`tmp`、ローカルアカウント設定は GitHub にコミットしないでください
- Bridge 本体は `127.0.0.1` に bind したまま使い、外に出すのは token 保護された URL だけにしてください

## 更新

- `update.bat` を実行すると、GitHub 上の最新版を取得して依存関係と検証を更新します
- ローカルの token や個人アカウント設定は Git 管理外なので、そのまま残ります

## 通知

- 起動通知は `PHONE_NTFY_TOPIC` / `PHONE_PUSHOVER_TOKEN` + `PHONE_PUSHOVER_USER` / `PHONE_DISCORD_WEBHOOK_URL` のいずれかで有効化できます
- 完了通知も欲しい場合は、追加で `PHONE_NOTIFY_ON_COMPLETE=1` を設定してください

## 設計メモ

- 全部入り版の情報設計: [docs/all-in-one-ia-ja.md](docs/all-in-one-ia-ja.md)

## ノア運用キット

ノアとして日誌を残しながら使いたい場合は、[ノア運用キット](ノア運用キット/README.md) を使ってください。

## コマンド

```powershell
setup.bat
start.bat
update.bat
npm run check
npm test
```
