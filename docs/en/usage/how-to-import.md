---
outline: deep
---

# Import Chat Records Guide

ChatLab offers three import paths on the home page. They share the same format detection, session matching, and message deduplication behavior, so choose the path that best fits your source.

## File import

For a local export file:

1. Drag the exported **data file** directly into the upload area on ChatLab's homepage.
2. Wait for ChatLab to finish parsing.

When the file uniquely matches an existing session, ChatLab incrementally adds new messages and skips duplicates. If a safe match cannot be made, it creates a new session.

## API import

The **API Import** tab includes both directions:

- **Automatic Sync (Pull):** ChatLab periodically fetches new chat records from a configured data source.
- **API Push (Push):** a third-party tool, plugin, or script writes chat records through ChatLab's local API.

Open the corresponding card to configure that path in Settings.

## Command-line import

Node.js 20 or newer is required. Install ChatLab CLI first:

```bash
npm install -g chatlab-cli
```

Import a local file directly:

```bash
chatlab import "/absolute/path/to/chat-export.json"
```

For automation and agent workflows, preview the write first:

```bash
chatlab import "/absolute/path/to/chat-export.json" --dry-run --json
```

The preview reports whether ChatLab will create or update a session, the target session, messages to add, and duplicates to skip without changing data. After reviewing it, run the same file and options without `--dry-run`. To target a specific session, include `--session-id <id>` in both commands.

### Import with an AI agent

Install the official `chatlab-import` skill:

```bash
npx skills add ChatLab/ChatLab --skill chatlab-import -g
```

Then ask Codex, Claude Code, Cursor, or another agent:

```text
chatlab-import import /absolute/path/to/chat-export.json into ChatLab
```

The skill uses the CLI to produce a read-only preview, explains the import plan, and waits for your confirmation before writing. It never edits ChatLab databases directly or includes message bodies in its response.

## Bug Troubleshooting

If the import fails, you can quickly troubleshoot the issue through logs:

Go to "Settings" in the bottom left corner > "Basic Settings" > "Log Files", and open that directory. Inside, there's an "import" folder containing all import log records.

If you can't understand the logs, submit an issue on GitHub. In command-line mode, the JSON `error.code` and `error.hint` fields also help diagnose path, format, concurrent import, and session-ID problems.
