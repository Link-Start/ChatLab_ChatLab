---
outline: deep
---

# 匯入聊天記錄指南

ChatLab 首頁提供三種匯入入口。它們共用相同的格式識別、工作階段匹配與訊息去重能力，你可以依資料來源選擇最合適的方式。

## 檔案匯入

適合手動匯入本機匯出檔案：

1. 將匯出的**資料檔案**直接拖入上傳區域。
2. 等待 ChatLab 解析完成即可。

如果匯入檔案能與現有工作階段唯一匹配，ChatLab 會增量補充新訊息並略過重複訊息；無法安全匹配時則會建立新工作階段。

## API 匯入

首頁的「API 匯入」包含兩個方向：

- **自動同步（Pull）**：由 ChatLab 定期從已設定的資料來源拉取新增聊天記錄。
- **API 推送（Push）**：由第三方工具、外掛或腳本透過 ChatLab 本機 API 主動寫入聊天記錄。

點擊對應卡片即可進入設定頁完成配置。

## 命令列匯入

需要 Node.js 20 或更新版本。先安裝 ChatLab CLI：

```bash
npm install -g chatlab-cli
```

直接匯入本機檔案：

```bash
chatlab import "/absolute/path/to/chat-export.json"
```

建議在自動化或 Agent 工作流程中先執行唯讀預覽：

```bash
chatlab import "/absolute/path/to/chat-export.json" --dry-run --json
```

預覽會回傳將要建立還是更新工作階段、目標工作階段、待寫入訊息數與重複訊息數，但不會修改資料。確認結果後，使用相同檔案和參數移除 `--dry-run` 再正式匯入。需要明確指定現有工作階段時，可在預覽與正式匯入中同時增加 `--session-id <id>`。

### 使用 AI Agent 匯入

安裝官方 `chatlab-import` Skill：

```bash
npx skills add ChatLab/ChatLab --skill chatlab-import -g
```

安裝後可直接告訴 Codex、Claude Code、Cursor 等 Agent：

```text
chatlab-import 幫我把 /absolute/path/to/chat-export.json 匯入 ChatLab
```

Skill 會先呼叫 CLI 做唯讀預覽，向你說明匯入計畫並等待確認，然後才執行寫入。它不會直接修改 ChatLab 資料庫，也不會在回覆中顯示聊天正文。

## BUG 排查

如果匯入失敗，可以透過日誌快速排查問題：

軟體左下角「設定」 > 「基礎設定」 > 「日誌檔案」，開啟該目錄，該目錄下有個「import」目錄，就是所有匯入的日誌記錄了。

如果您看不懂，可以透過 GitHub issue 提交問題。命令列模式還可以依 JSON 中的 `error.code` 與 `error.hint` 排查檔案路徑、格式、並行匯入或工作階段 ID 問題。
