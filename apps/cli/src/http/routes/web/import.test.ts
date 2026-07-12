import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'

import { registerImportRoutes } from './import'

function multipartPayload(): { payload: Buffer; contentType: string } {
  const boundary = '----chatlab-auto-import-route-test'
  const field = (name: string, value: string) =>
    [`--${boundary}`, `Content-Disposition: form-data; name="${name}"`, '', value].join('\r\n')
  const file = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="chat.json"',
    'Content-Type: application/json',
    '',
    '{"messages":[]}',
  ].join('\r\n')

  return {
    payload: Buffer.from(
      [field('formatId', 'telegram-json'), field('chatIndex', '2'), file, `--${boundary}--`, ''].join('\r\n')
    ),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

describe('CLI Web automatic import route', () => {
  it('forwards parser options and preserves a zero-new incremental result in the done event', async () => {
    const app = Fastify()
    const calls: Array<{ formatId?: string; chatIndex?: number }> = []
    try {
      await app.register(multipart)
      registerImportRoutes(
        app,
        {} as any,
        {
          runAutoImport: async (_filePath: string, options: Record<string, unknown>) => {
            calls.push({
              formatId: options.formatId as string | undefined,
              chatIndex: options.chatIndex as number | undefined,
            })
            return {
              success: true,
              sessionId: 'existing-session',
              importMode: 'incremental',
              matchedBy: 'trailing-messages',
              newMessageCount: 0,
              duplicateCount: 5,
            }
          },
        } as any
      )

      const body = multipartPayload()
      const response = await app.inject({
        method: 'POST',
        url: '/_web/import',
        headers: { 'content-type': body.contentType },
        payload: body.payload,
      })

      assert.equal(response.statusCode, 200)
      assert.deepEqual(calls, [{ formatId: 'telegram-json', chatIndex: 2 }])
      assert.match(response.body, /event: done/)
      assert.doesNotMatch(response.body, /event: error/)
      assert.match(response.body, /"importMode":"incremental"/)
      assert.match(response.body, /"newMessageCount":0/)
      assert.match(response.body, /"duplicateCount":5/)
    } finally {
      await app.close()
    }
  })
})
