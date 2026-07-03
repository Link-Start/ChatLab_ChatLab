import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { capExpandedSearchMessages } from './commands-messages'
import type { MessageLike } from './messages-output'

describe('capExpandedSearchMessages', () => {
  it('keeps hit messages when the cap is smaller than pre-context', () => {
    const messages: MessageLike[] = [
      { id: 10, senderName: 'Alice', content: 'before 1', timestamp: 1710000000 },
      { id: 11, senderName: 'Alice', content: 'before 2', timestamp: 1710000001 },
      { id: 12, senderName: 'Bob', content: 'alpha hit', timestamp: 1710000002 },
    ]

    const capped = capExpandedSearchMessages(messages, new Set([12]), 1)

    assert.deepEqual(
      capped.map((message) => message.id),
      [12]
    )
  })
})
