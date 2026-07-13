---
name: chatlab-import
description: Safely preview and import local chat export files into ChatLab through the chatlab CLI. Use when a user asks an external agent to import, re-import, or incrementally update ChatLab from a local QQ, WeChat, Telegram, WhatsApp, LINE, Discord, Instagram, Google Chat, ChatLab JSON/JSONL, or other supported chat export.
---

# ChatLab Import

Import only through the `chatlab` CLI. Always preview the exact write first, keep local message content out of the response, and use the CLI's JSON envelope as the source of truth.

## Workflow

1. Check that the CLI is available:

```bash
chatlab --help
```

If it is missing, tell the user to install it with `npm install -g chatlab-cli`. Do not install software without the user's approval.

2. Resolve the exact local file path. Do not guess between multiple files. Quote the path in every command.

3. Run a read-only preview:

```bash
chatlab import "/absolute/path/to/chat-export.json" --dry-run --json
```

When the user explicitly chose a target session, preserve it in both preview and import:

```bash
chatlab import "/absolute/path/to/chat-export.json" --session-id <session-id> --dry-run --json
```

4. Read the JSON envelope. Report only:

- whether ChatLab will create a session or update an existing one;
- the target session ID when present;
- messages scanned, messages to add, and duplicates to skip;
- the match method or create reason when present.

Do not quote chat message content. If `ok` is false, follow `error.hint` only when the correction is unambiguous.

5. Before writing, ask for a concise confirmation of the previewed plan. If `createReason` is `ambiguous`, explicitly offer either creating a new session or rerunning with a user-selected `--session-id`; do not choose a target session yourself.

6. After confirmation, run the same command without `--dry-run`:

```bash
chatlab import "/absolute/path/to/chat-export.json" --json
```

Keep any `--session-id` or `--format` used in the accepted preview unchanged.

7. Verify the final JSON envelope. Report the resulting session ID, created/incremental mode, new-message count, and duplicate count.

## Error Handling

- `FILE_NOT_FOUND`: ask for the correct path; do not search unrelated directories.
- `UNRECOGNIZED_FORMAT`: run `chatlab formats`, then use `--format <id>` only when the format is clear.
- `IMPORT_IN_PROGRESS`: tell the user another writer owns the data-directory import lock and retry later.
- `INVALID_SESSION_ID`: ask for a valid session ID; never sanitize an unsafe ID silently.
- Other failures: surface the error and hint without repeatedly retrying a write.

## Safety Rules

- Treat import as a local data write. Never skip the preview.
- Never reveal full chat exports or message bodies.
- Never invent a session ID, parser format, or file path.
- Never delete or merge sessions as part of this workflow.
- Never edit ChatLab databases directly.
- Use the same file, target, and format between preview and execution.
