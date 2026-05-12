# Phone Bridge

Phone Bridgeは、スマホから利用者本人のPCで動くCodexを操作するための入口です。

Bridgeは既定で `127.0.0.1` にだけbindします。スマホは `start.bat` が作るCloudflareトンネル、または `PHONE_PUBLIC_URL` で設定した固定URLから接続します。

## 起動

```powershell
setup.bat
start.bat
```

起動画面にQRコードが1つ表示されます。それをスマホで読み込みます。

## 構成

```text
スマホブラウザ
  -> token付きの外用URL
  -> PC内のbridge 127.0.0.1:45214
  -> Codex app-server ws://127.0.0.1:45213
```

URLには `?token=...` が含まれます。他人に見せないでください。

## 固定URL

Quick TunnelのURLは再起動で変わることがあります。顧客向けには固定URLを設定します。

```env
PHONE_PRODUCT_MODE=1
PHONE_TOKEN=replace-with-a-long-random-secret
PHONE_PUBLIC_URL=https://your-fixed-domain.example.com
PHONE_BIND_HOST=127.0.0.1
```

起動:

```powershell
npm run phone:product
```

