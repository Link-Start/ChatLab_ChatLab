import assert from 'node:assert/strict'
import test from 'node:test'
import { DataDirCompatibilityError } from '@openchatlab/node-runtime/src/data-dir-compat'
import { ApiErrorCode, apiErrorFromUnknown } from './errors'
import { ImportInProgressError } from '@openchatlab/node-runtime/src/import/import-lock'

test('apiErrorFromUnknown maps the shared import lock error to 409', () => {
  const apiError = apiErrorFromUnknown(new ImportInProgressError())

  assert.equal(apiError?.code, ApiErrorCode.IMPORT_IN_PROGRESS)
  assert.equal(apiError?.statusCode, 409)
})

test('apiErrorFromUnknown maps wrapped data directory compatibility errors to 409', () => {
  const cause = new DataDirCompatibilityError(
    'DATA_DIR_REQUIRES_NEWER_RUNTIME',
    'ChatLab data directory requires runtime version 0.25.1 or newer; current version is 0.25.0.',
    {
      userDataDir: '/tmp/chatlab-data',
      metaPath: '/tmp/chatlab-data/.chatlab-meta.json',
      currentVersion: '0.25.0',
      minRuntimeVersion: '0.25.1',
    }
  )

  const apiError = apiErrorFromUnknown(new Error('Desktop startup formatted message', { cause }))

  assert.equal(apiError?.code, ApiErrorCode.DATA_DIR_INCOMPATIBLE)
  assert.equal(apiError?.statusCode, 409)
  assert.match(apiError?.message ?? '', /requires runtime version 0\.25\.1/)
})
