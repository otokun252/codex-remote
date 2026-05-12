# agentmemory連携

`agentmemory` は、CodexなどのAIエージェントに長期記憶を追加するローカルMemoryサーバーです。

このリポジトリでは、他人と共有するクラウド記憶ではなく、利用者本人のPCで動くローカル記憶として扱います。

参照元:

```text
https://github.com/rohitg00/agentmemory
```

## 起動

```powershell
start-memory.bat
```

または:

```powershell
npm run memory:start
```

起動後、Memory APIは通常 `http://127.0.0.1:3111`、Viewerは `http://127.0.0.1:3113` で開きます。

確認:

```powershell
npm run memory:health
```

## CodexのMCPに追加する設定例

CodexのMCP設定に、次の `agentmemory` サーバーを追加します。

```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://127.0.0.1:3111"
      }
    }
  }
}
```

既存の `mcpServers` がある場合は、上書きせず `agentmemory` の項目だけ追加してください。

## 注意

- Memoryは利用者本人のPCに保存します。
- Memory DBやログをGitHubに公開しないでください。
- `AGENTMEMORY_SECRET` を使う場合、その値もGitHubに入れないでください。
- スマホから直接Memoryサーバーを公開しません。Codex Remote経由でCodexを操作し、Codex側がMCPとしてMemoryを使います。

