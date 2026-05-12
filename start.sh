#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js が見つかりません。https://nodejs.org/ から LTS 版をインストールしてから、もう一度 start.sh を開いてください。"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm が見つかりません。Node.js LTS 版をインストールし直してから、もう一度 start.sh を開いてください。"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "初回セットアップ中です。npm パッケージをインストールします..."
  npm install
fi

npm run setup:cloudflared

export PHONE_PUBLIC_TUNNEL=1
npm run phone:tunnel
