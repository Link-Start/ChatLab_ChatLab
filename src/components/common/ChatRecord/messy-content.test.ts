import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { analyzeMessyContent } from './messy-content'

describe('analyzeMessyContent', () => {
  it('collapses noisy multiline exports without depending on URLs', () => {
    const content = `

\t
\t\t共享内容标题
多人转发
\tview
\t5

\t\t305f020100044b30490201000204846c4a3802032f53a20204afb5a97402046a3b7c61042433333039336236362d323531622d343534622d396561622d383235343132626435633836020405180803020100040d004c51e6000000000000000000
\t\t7d9c1deea7ef68b29a2bd5fa8bc5ff72
\t\t147bea67c1720db31fef2ee211d8ee0e
\t2
\tGhQKEnd4ZDhhMjc1MGNlOWQ0Njk4MA==
\tfalse
\t\t-1
\t-1
member_gh9gt7d9p30422
\t0
\t\t46
\t\t来源标签

`

    const result = analyzeMessyContent(content)

    assert.equal(result.shouldCollapse, true)
    assert.deepEqual(result.previewLines, ['共享内容标题', '多人转发', 'view'])
    assert.equal(result.normalizedContent.startsWith('\t\t共享内容标题'), true)
    assert.equal(result.normalizedContent.endsWith('来源标签'), true)
    assert.ok(result.hiddenLineCount > 0)
  })

  it('does not collapse readable multiline chat content', () => {
    const content = `

今天整理了一下六月的记录
发现其实很多事情已经推进完了
剩下的是把安装流程再打磨一下
这个可以明天继续看

`

    const result = analyzeMessyContent(content)

    assert.equal(result.shouldCollapse, false)
    assert.deepEqual(result.previewLines, [
      '今天整理了一下六月的记录',
      '发现其实很多事情已经推进完了',
      '剩下的是把安装流程再打磨一下',
    ])
    assert.equal(result.normalizedContent, content.trim())
  })

  it('uses readable leaf text as the preview for generic XML content', () => {
    const content = `<?xml version="1.0"?>
<message>
  <payload>
    <title>可读标题</title>
    <description>第一行说明
多人转发</description>
    <action>view</action>
    <type>5</type>
    <link>https://example.test/items/abc?source=chat&amp;token=preview</link>
    <backupLink>https://docs.example.test/read/123</backupLink>
    <attachment>
      <checksum>305f020100044b30490201000204846c4a3802032f53a20204afb5a97402046a3b7c61042433333039336236362d323531622d343534622d396561622d383235343132626435633836</checksum>
      <encoded>GhQKEnd4ZDhhMjc1MGNlOWQ0Njk4MA==</encoded>
    </attachment>
    <flag>false</flag>
  </payload>
</message>`

    const result = analyzeMessyContent(content)

    assert.equal(result.shouldCollapse, true)
    assert.deepEqual(result.previewLines, ['可读标题', '第一行说明', '多人转发'])
    assert.deepEqual(result.linkUrls, [
      'https://example.test/items/abc?source=chat&token=preview',
      'https://docs.example.test/read/123',
    ])
    assert.equal(result.normalizedContent.startsWith('<?xml version="1.0"?>'), true)
  })
})
