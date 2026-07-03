/**
 * Regression: `topics list --format agent` must return data.text (design §13
 * recipe 3 and SKILL/manifest recommend agent format for summaries), with
 * [#segmentId] markers that chain into `topics show --id`.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseSqlRowLimit, topicsAgentText, type TopicListItem } from './commands-topics-sql'
import { QueryError } from './envelope'

const items: TopicListItem[] = [
  {
    id: 12,
    since: '2026-06-01T09:00:00+08:00',
    until: '2026-06-01T11:30:00+08:00',
    messages: 34,
    participants: ['老王', '小红'],
    summary: '讨论了五一旅游计划和签证材料准备',
  },
  {
    id: 15,
    since: '2026-06-02T10:00:00+08:00',
    until: '2026-06-02T10:20:00+08:00',
    messages: 8,
    participants: ['小红'],
    summary: null,
  },
]

describe('topicsAgentText', () => {
  it('renders [#segmentId] markers, time range and summaries', () => {
    const text = topicsAgentText(items)
    assert.ok(text.includes('[#12]'), text)
    assert.ok(text.includes('讨论了五一旅游计划和签证材料准备'))
    assert.ok(text.includes('34 msgs'))
    assert.ok(text.includes('老王, 小红'))
    assert.ok(text.startsWith('returned: 2'))
  })

  it('falls back to a stable line when no summaries exist', () => {
    assert.equal(topicsAgentText([]), 'No summaries.')
  })
})

describe('parseSqlRowLimit', () => {
  it('rejects zero because SQL maxRows=0 means unlimited', () => {
    assert.throws(
      () => parseSqlRowLimit('0'),
      (err: unknown) => err instanceof QueryError && err.code === 'INVALID_ARGUMENT'
    )
  })
})
