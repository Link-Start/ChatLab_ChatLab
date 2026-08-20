import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCrossChatSystemPrompt } from '../cross-chat-agent'

describe('cross-chat agent prompt', () => {
  it('locks the agent to dedicated tools and makes scope semantic rather than persistent', () => {
    const prompt = buildCrossChatSystemPrompt('zh-CN')
    for (const tool of [
      'resolve_chat_entities',
      'search_messages_globally',
      'get_cross_chat_message_context',
      'get_cross_chat_overview',
    ]) {
      assert.match(prompt, new RegExp(tool))
    }
    assert.match(prompt, /不构成永久锁定范围/)
    assert.match(prompt, /交集、并集/)
    assert.match(prompt, /唯一候选自动继续/)
    assert.match(prompt, /多个候选必须停下来请用户确认/)
    assert.match(prompt, /限定 scopes 时，可以不提供关键词/)
    assert.match(prompt, /最近.*90 天/)
    assert.match(prompt, /recent_days/)
    assert.match(prompt, /sender.*owner/)
    assert.match(prompt, /本人发言.*检索种子/)
    assert.match(prompt, /coverage/)
    assert.doesNotMatch(prompt, /可以使用.*execute_sql/)
  })
})
