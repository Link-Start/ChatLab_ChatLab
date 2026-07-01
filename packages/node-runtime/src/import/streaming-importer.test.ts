import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { CHAT_DB_TABLES } from '@openchatlab/core'
import { BetterSqliteAdapter } from '../better-sqlite3-adapter'
import { streamingImport } from './streaming-importer'

const nativeBinding = path.resolve('apps/cli/native/better_sqlite3.node')

function makeTempDir(): string {
  const baseDir = fs.existsSync('/private/tmp') ? '/private/tmp' : os.tmpdir()
  return fs.mkdtempSync(path.join(baseDir, 'chatlab-streaming-import-'))
}

function writeChunkedQqExport(root: string): string {
  const chunksDir = path.join(root, 'chunks')
  fs.mkdirSync(chunksDir, { recursive: true })

  const avatar = 'data:image/png;base64,AAAA'
  fs.writeFileSync(path.join(root, 'avatars.json'), JSON.stringify({ '10001': avatar }, null, 2), 'utf-8')

  const message = {
    id: 'msg-1',
    seq: '1',
    timestamp: 1711468800000,
    time: '2024-03-26T16:00:00.000Z',
    sender: {
      uid: 'u_10001',
      uin: '10001',
      name: 'Alice',
      nickname: 'Alice',
      groupCard: 'Alice Card',
    },
    type: 'text',
    content: { text: 'hello', elements: [], resources: [], mentions: [] },
    recalled: false,
    system: false,
  }
  fs.writeFileSync(path.join(chunksDir, 'chunk_0001.jsonl'), `${JSON.stringify(message)}\n`, 'utf-8')

  const manifest = {
    metadata: {
      name: 'shuakami/qq-chat-exporter',
      version: '5.5.0',
      exportTime: '2024-03-26T16:00:00.000Z',
      format: 'chunked-jsonl',
    },
    chatInfo: {
      name: 'Avatar Test Group',
      type: 'group',
      selfUid: 'u_10001',
      selfUin: '10001',
      selfName: 'Alice',
    },
    statistics: {
      totalMessages: 1,
      timeRange: {
        start: '2024-03-26T16:00:00.000Z',
        end: '2024-03-26T16:00:00.000Z',
        durationDays: 1,
      },
      messageTypes: { text: 1 },
      senders: [{ uid: 'u_10001', name: 'Alice', messageCount: 1, percentage: 100 }],
    },
    chunked: {
      format: 'jsonl',
      chunksDir: 'chunks',
      chunkFileExt: '.jsonl',
      maxMessagesPerChunk: 1000,
      maxBytesPerChunk: 1024 * 1024,
      chunks: [
        {
          index: 1,
          fileName: 'chunk_0001.jsonl',
          relativePath: 'chunks/chunk_0001.jsonl',
          count: 1,
          start: '2024-03-26T16:00:00.000Z',
          end: '2024-03-26T16:00:00.000Z',
        },
      ],
    },
    avatars: { file: 'avatars.json', count: 1 },
  }
  const manifestPath = path.join(root, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  return manifestPath
}

test('streamingImport updates avatars for members first created from message batches', async () => {
  const root = makeTempDir()
  const manifestPath = writeChunkedQqExport(root)
  const dbPath = path.join(root, 'avatar-test.db')

  const result = await streamingImport(
    manifestPath,
    {
      openDatabase() {
        const db = new Database(dbPath, { nativeBinding })
        db.exec(CHAT_DB_TABLES)
        return new BetterSqliteAdapter(db)
      },
      deleteDatabase() {
        for (const suffix of ['', '-wal', '-shm']) {
          try {
            fs.unlinkSync(dbPath + suffix)
          } catch {
            /* ignore */
          }
        }
      },
      onProgress() {
        /* noop for this focused importer test */
      },
    },
    undefined,
    'avatar-test'
  )

  assert.equal(result.success, true)

  const db = new Database(dbPath, { nativeBinding })
  const row = db.prepare('SELECT platform_id, avatar FROM member WHERE platform_id = ?').get('10001') as
    | { platform_id: string; avatar: string | null }
    | undefined
  db.close()

  assert.equal(row?.platform_id, '10001')
  assert.equal(row?.avatar, 'data:image/png;base64,AAAA')
})
