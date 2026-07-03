---
name: chatlab-cli
description: Query local chat history (WeChat/QQ/Telegram/WhatsApp and more) through the chatlab CLI. Use when the user asks what a chat group talked about, who said something first, conversation stats, topics, or keyword evidence from imported chat records.
---

# ChatLab CLI for AI Agents

`chatlab` queries locally imported chat history. Read-only for agents: search, list, stats, topics, SQL fallback. Run `chatlab manifest` once to get the full machine-readable command tree (commands, options, exit codes, examples).

## Contract

- Always pass `--format` explicitly: `agent` for message bodies (preprocessed, token-friendly text), `json` for structural data (`--no-content`, `--fields`, stats).
- stdout carries exactly one JSON envelope per call; logs go to stderr.
- Success: `{ ok: true, command, data, meta }`. Failure: `{ ok: false, command, error: { code, message, hint, candidates? } }`.
- Exit codes: 0 ok, 2 bad argument/disabled capability, 3 not found, 4 ambiguous (retry with an id from `error.candidates`), 5 SQL error.
- Pagination: when `meta.hasMore` is true, re-run the same query with `--cursor <meta.nextCursor>`.
- Time: ISO dates (`2026-06-01`, `"2026-06-01 08:30"`), `today`, `yesterday`, or `--last 30d` (h/d/w). Date-only `--until` includes the whole day; resolved bounds are echoed in `meta.timeRange`.
- Members: pass an id, exact name, or `me` (the data owner). Ambiguity returns candidates with ids.
- Privacy preprocessing (desensitization, blacklist) is always on. Do not use `--raw`; it is disabled unless the user opts in.
- `[#1021]` markers in agent text are message ids; `[#1021*]` marks search hits; `[#1021-1024]` is a merged block. Use these ids as evidence citations.

## Task recipes

```bash
# Discover sessions (skip --session everywhere if there is only one)
chatlab sessions list --format json

# "What did this group talk about today?"
chatlab messages list --session <id> --since today --limit 100 --max-tokens 2000 --format agent

# "Main topics this month?" (AI summaries; falls back to keywords if empty)
chatlab topics list --session <id> --since 2026-07-01 --format agent
chatlab stats keywords --session <id> --last 30d --top 20 --format json

# "Who mentioned X first? Give evidence."
chatlab messages search "服务器迁移" --session <id> --sort asc --limit 5 --context 3 --format agent

# Follow up an evidence id from [#1021*]
chatlab messages context --id 1021 --session <id> --window 10 --format agent

# "What did I talk about with 小红 last month?"
chatlab messages between --member me --member 小红 --session <id> --last 30d --format agent

# "Who is most active?"
chatlab stats activity --session <id> --top 10 --format json

# Scout hit distribution before pulling bodies (json is correct here)
chatlab messages search "旅游" "旅行" --session <id> --since 2026-01-01 --no-content --limit 100 --format json

# Next page of results
chatlab messages search "报销" --session <id> --cursor <meta.nextCursor> --format agent

# Advanced fallback: read-only SQL (string cells are desensitized)
chatlab schema --session <id> --format json
chatlab sql "SELECT strftime('%Y-%m', ts, 'unixepoch') AS m, COUNT(*) AS n FROM message GROUP BY m" --session <id> --format json
```

## Token budget

`--limit` caps primary hits, `--max-messages` caps context expansion, `--max-tokens` caps agent text (default 4000), `--max-chars` caps per-message length. Prefer narrowing time ranges and paginating over raising limits.
