import * as fs from 'fs'
import { KNOWN_PLATFORMS } from '@openchatlab/shared-types'

import {
  parseTelegramSingleJson,
  TELEGRAM_SINGLE_CHAT_TYPE_PATTERN,
  TELEGRAM_SINGLE_HEAD_SIGNATURES,
} from '../browser/telegram'
import type { FormatFeature, FormatModule, ParseEvent, ParseOptions, Parser } from '../types'
import { createProgress, getFileSize } from '../utils'

export const feature: FormatFeature = {
  id: 'telegram-native-single',
  name: 'Telegram 单聊天导出 (JSON)',
  platform: KNOWN_PLATFORMS.TELEGRAM,
  priority: 23,
  extensions: ['.json'],
  signatures: {
    head: TELEGRAM_SINGLE_HEAD_SIGNATURES,
    requiredFields: ['messages'],
    fieldPatterns: { telegramChatType: TELEGRAM_SINGLE_CHAT_TYPE_PATTERN },
  },
}

async function* parseTelegramSingle(options: ParseOptions): AsyncGenerator<ParseEvent, void, unknown> {
  const { filePath, batchSize = 5000, onProgress, onLog } = options
  const totalBytes = getFileSize(filePath)
  const initialProgress = createProgress('parsing', 0, totalBytes, 0, '')
  yield { type: 'progress', data: initialProgress }
  onProgress?.(initialProgress)
  onLog?.('info', `Starting Telegram single-chat JSON parsing (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`)

  let result
  try {
    result = await parseTelegramSingleJson(fs.readFileSync(filePath, 'utf-8'))
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error))
    onLog?.('error', 'Telegram single-chat JSON parsing failed')
    yield { type: 'error', data: parseError }
    return
  }

  yield { type: 'meta', data: result.meta }
  yield { type: 'members', data: result.members }
  for (let index = 0; index < result.messages.length; index += batchSize) {
    const batch = result.messages.slice(index, index + batchSize)
    yield { type: 'messages', data: batch }
    const processed = index + batch.length
    if (processed < result.messages.length) {
      const progress = createProgress(
        'parsing',
        Math.round((processed / result.messages.length) * totalBytes),
        totalBytes,
        processed,
        `Processed ${processed} messages`
      )
      yield { type: 'progress', data: progress }
      onProgress?.(progress)
    }
  }

  const doneProgress = createProgress('done', totalBytes, totalBytes, result.messages.length, '')
  yield { type: 'progress', data: doneProgress }
  onProgress?.(doneProgress)
  onLog?.(
    'info',
    `Telegram single-chat JSON parsing completed: ${result.messages.length} messages, ${result.members.length} members`
  )
  yield {
    type: 'done',
    data: { messageCount: result.messages.length, memberCount: result.members.length },
  }
}

export const parser_: Parser = { feature, parse: parseTelegramSingle }

const module_: FormatModule = { feature, parser: parser_ }

export default module_
