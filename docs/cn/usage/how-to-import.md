---
outline: deep
---

# 导入聊天记录指南

ChatLab 首页提供三种导入入口。它们最终使用同一套格式识别、会话匹配和消息去重能力，你可以按数据来源选择最顺手的方式。

## 文件导入

适合手动导入本地导出文件：

1. 将导出的**数据文件**直接拖入上传区域。
2. 等待 ChatLab 解析完成即可。

如果导入文件与已有会话能唯一匹配，ChatLab 会增量补充新消息并跳过重复消息；不能安全匹配时会创建新会话。

## API 导入

首页的「API 导入」包含两个方向：

- **自动同步（Pull）**：由 ChatLab 定时从已配置的数据源拉取新增聊天记录。
- **API 推送（Push）**：由第三方工具、插件或脚本通过 ChatLab 本地 API 主动写入聊天记录。

点击对应卡片即可进入设置页完成配置。

## 命令行导入

需要 Node.js 20 或更高版本。先安装 ChatLab CLI：

```bash
npm install -g chatlab-cli
```

直接导入本地文件：

```bash
chatlab import "/absolute/path/to/chat-export.json"
```

建议在自动化或 Agent 工作流中先执行只读预览：

```bash
chatlab import "/absolute/path/to/chat-export.json" --dry-run --json
```

预览会返回将要新建还是更新会话、目标会话、待写入消息数和重复消息数，但不会修改数据。确认结果后，使用相同文件和参数移除 `--dry-run` 再正式导入。需要明确指定已有会话时，可在预览和正式导入中同时增加 `--session-id <id>`。

### 使用 AI Agent 导入

安装官方 `chatlab-import` Skill：

```bash
npx skills add ChatLab/ChatLab --skill chatlab-import -g
```

安装后可直接告诉 Codex、Claude Code、Cursor 等 Agent：

```text
chatlab-import 帮我把 /absolute/path/to/chat-export.json 导入 ChatLab
```

Skill 会先调用 CLI 做只读预览，向你说明导入计划并等待确认，然后才执行写入。它不会直接修改 ChatLab 数据库，也不会在回复中展示聊天正文。

## BUG 排查

如果导入失败，可以通过日志快速排查问题：

软件左下角「设置」 > 「基础设置」 > 「日志文件」，打开该目录，该目录下有个「import」目录，就是所有导入的日志记录了。

如果您看不懂，可以通过 GitHub issue 提交问题。命令行模式还可以根据 JSON 中的 `error.code` 和 `error.hint` 排查文件路径、格式、并发导入或会话 ID 问题。
