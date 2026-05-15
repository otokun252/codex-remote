# Codex Remote 全部入り版 情報設計

この文書は、`codexremote` を単なるスマホ用チャット画面ではなく、Windows / Mac 両対応のローカルファースト Bridge として拡張するための情報設計です。

狙いは「機能を全部 1 画面に詰める」ことではありません。  
狙いは「接続基盤を共通化したうえで、役割ごとに画面を分け、全部入りでも壊れにくい構造にする」ことです。

## 1. 目標

- スマホから Codex の進行を止めずに操作できる
- Windows / Mac のどちらでも同じ考え方で使える
- 複数端末で同じ Bridge を見られる
- 画像、スクショ、差分、ログ、投稿文などの成果物を整理して見られる
- X / X Articles / note / LP 更新などの実務ワークフローを扱える
- 接続が切れても復帰しやすい
- 顧客配布できる

## 2. 設計原則

1. 実行本体は PC 側に置く  
   スマホは操作画面と確認画面に徹する。

2. 接続、状態、成果物を分離する  
   チャット状態と接続状態と成果物一覧を同じ配列で持たない。

3. 1 画面 1 役割にする  
   操作、監視、成果物、管理を分ける。

4. Quick Tunnel 前提にしない  
   テスト時は許容するが、継続利用では固定 URL を前提に設計する。

5. 個人ワークフローと配布モードを分ける  
   個人用の X / note 導線と、顧客向けの公開 UI を同じままにしない。

## 3. 画面構成

### 3-1. 操作

日常的に一番使う画面です。

- 入力欄
- 送信
- 追加指示
- 停止
- 承認
- 実行状態
- 最新 1 件の成果物
- 接続状態の要約

目的:

- 迷わず指示を送る
- 進行中でも追加指示を流し込む
- 承認待ちで止まった時だけ介入する

表示しないもの:

- 長いログ全文
- 全履歴の差分
- 管理設定の詳細

### 3-2. 監視

進行確認用の画面です。

- 実行中タスク
- ステータス履歴
- ログ
- diff 要約
- スクリーンショット
- 承認待ち内容
- 接続端末一覧
- 最終同期時刻

目的:

- 今どこで止まっているかをすぐ見る
- エラーか承認待ちかを区別する
- 複数端末で同じ進行を監視する

### 3-3. 成果物

チャットから切り離した成果物一覧です。

- 生成画像
- スクリーンショット
- 投稿文
- X Articles 草稿
- note 草稿
- 差分ファイル
- エクスポート済みファイル
- 最終 URL

目的:

- 「今回できたもの」を一覧で見る
- チャット履歴に埋もれさせない
- スマホで保存、確認、共有しやすくする

### 3-4. 実務

用途別プリセットを置く画面です。

- X 投稿
- 引用ポスト
- X Articles
- note 下書き
- LP 修正
- スクショ送信
- 画像生成
- フォルダ確認

目的:

- 自由入力に頼らず、よく使う仕事を定型化する
- 非エンジニアでも迷わない導線にする

### 3-5. 管理

接続と配布と復旧のための画面です。

- 接続センター
- URL
- token 状態
- 固定 URL / Quick Tunnel の別
- 端末一覧
- Bridge 状態
- 更新
- 自動起動
- トラブル診断

目的:

- 壊れた時に戻せる
- 顧客配布時の案内を単純にする

## 4. 端末ロール

複数端末対応は「同じ画面を増やす」だけでは弱いので、ロールを持たせます。

- `operator`
  - 送信、追加指示、承認、停止ができる
- `monitor`
  - ログ、スクショ、進行確認が中心
- `approver`
  - 承認のみを優先して扱う
- `viewer`
  - 閲覧専用

端末ごとの例:

- iPhone: `operator`
- iPad: `monitor`
- PC ブラウザ: `approver`
- 顧客閲覧端末: `viewer`

## 5. 共通状態

全部入りでも壊れにくくするため、状態は最低でも以下に分けます。

### 5-1. connection

- `token`
- `deviceId`
- `deviceName`
- `deviceRole`
- `origin`
- `lastPublicUrl`
- `connectionMode`
- `lastConnectedAt`
- `lastDisconnectReason`
- `reconnectAttempt`
- `isOnline`

### 5-2. session

- `selectedThread`
- `lastThread`
- `threadList`
- `liveTurnId`
- `runState`
- `approvalState`
- `statusChip`

### 5-3. client

- `preferredModel`
- `reasoning`
- `speed`
- `theme`
- `accessMode`
- `draftText`
- `draftRestored`

### 5-4. artifacts

- `artifacts[]`
- `images[]`
- `screenshots[]`
- `files[]`
- `urls[]`
- `lastArtifactAt`

### 5-5. devices

- `devices[]`
- `connectedCount`
- `activeApprover`
- `lastPresenceUpdateAt`

### 5-6. workflows

- `xPostDraft`
- `quotePostDraft`
- `xArticleDraft`
- `noteDraft`
- `lpTaskState`

## 6. 保存するデータ

### 6-1. スマホ localStorage

- `token`
- `deviceId`
- `deviceName`
- `deviceRole`
- `lastPublicUrl`
- `lastThread`
- `lastConnectedAt`
- `preferredModel`
- `reasoning`
- `speed`
- `accessMode`
- `theme`
- `draftText`

### 6-2. PC 側 state

- 端末 registry
- 現在の thread
- task 状態
- approval 状態
- recent logs
- artifact metadata
- 最終接続 URL
- 最終公開モード

### 6-3. 保存しないもの

- ブラウザの生 Cookie
- 個人アカウントの token
- IP アドレスの長期保存
- GitHub に出してはいけない local path や秘密情報

## 7. イベント設計

リアルタイム同期のイベントは最低限こう整理します。

- `ready`
- `presence`
- `status`
- `turnStarted`
- `turnQueued`
- `turnCompleted`
- `turnStopped`
- `approvalRequested`
- `approvalResolved`
- `artifactAdded`
- `screenshotAdded`
- `imageAdded`
- `error`
- `bridgeOffline`
- `bridgeOnline`

ポイント:

- スクショと生成画像は同じ `artifact` で雑にまとめず、種類を分ける
- `approvalRequested` と `approvalResolved` を分ける
- `presence` は接続人数と端末ロールを含む

## 8. プリセットワークフロー

自由入力中心のままだと差別化しづらいので、よく使う仕事はプリセット化します。

### 8-1. 発信

- X 投稿
- 引用ポスト
- X Articles
- note 下書き

### 8-2. 制作

- 画像生成
- LP 修正
- スクショ送信
- ファイル確認

### 8-3. 管理

- 今の進行を要約
- エラー原因を確認
- 接続をやり直す
- 端末一覧を確認

## 9. Windows / Mac 両対応の方針

両対応は UI を分けるのではなく、OS 差分を Bridge 側に閉じ込めます。

共通に見せるもの:

- 接続方法
- 端末ロール
- チャット操作
- 監視画面
- 成果物画面
- 管理画面

OS ごとに吸収するもの:

- 自動起動設定
- スクショ取得方法
- ブラウザ起動コマンド
- 既定保存先
- 常駐方法

表示文言:

- `PC側Bridge` を基本とする
- 必要な場所だけ `Windows / Mac` を補足する

## 10. パフォーマンス方針

全部盛りにしても重くしないための制約です。

1. 初期表示で全履歴を読み込まない
2. 成果物は一覧と詳細を分ける
3. スクショと画像はサムネイル優先
4. ログは増分で流す
5. 端末一覧は presence 更新だけで描画する
6. 実務プリセットは lazy load 可能にする
7. チャット画面で管理 UI を常時出さない

## 11. 実装順

### Phase A: 基盤

- 接続プロファイル
- 再接続
- thread 復元
- 下書き保護
- 端末 registry
- 接続センター

### Phase B: 監視と成果物

- スクショ / 画像 / ファイルの整理
- 成果物一覧
- 監視画面
- presence 表示

### Phase C: 発信ワークフロー

- X 投稿
- 引用ポスト
- X Articles
- note
- LP 修正

### Phase D: 商品化

- 固定 URL 前提の導線
- setup / update / startup
- 権限ロール
- product mode
- トラブル診断

## 12. 今の repo に対する具体化

現在の `codexremote` では、次の方向で揃えると破綻しにくいです。

- `public/main.js`
  - 状態を `connection/session/client/artifacts/devices/workflows` に整理する
- `scripts/session-store.js`
  - device registry と artifact metadata を責務として持つ
- `scripts/start-phone.js`
  - 接続センター、presence、approval 競合制御、artifact broadcast を担当する
- `public/index.html`
  - 画面の分割前提のナビゲーションを持つ
- `README.ja.md`
  - 操作、復旧、固定 URL、複数端末、配布を初心者向けに説明する

## 13. 判断基準

機能追加時は毎回、次の基準で入れるかを決めます。

1. 接続が壊れにくくなるか
2. 復旧が分かりやすくなるか
3. 発信や制作の実務が速くなるか
4. スマホ UI の迷いを減らすか
5. 複数端末で見た時に一貫性があるか

この基準で弱いものは、全部入り候補でも後回しにします。
