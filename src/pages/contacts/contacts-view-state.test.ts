/**
 * Run: pnpm test -- src/pages/contacts/contacts-view-state.test.ts
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type { ContactsDiagnostics } from '@openchatlab/shared-types'
import { shouldShowContactsDisabledNotice } from './contacts-view-state'

function diagnostics(overrides: Partial<ContactsDiagnostics> = {}): ContactsDiagnostics {
  return {
    privateSessionCount: 0,
    activePrivateSessionCount: 0,
    contactsEnabled: false,
    skippedMissingOwnerSessions: 0,
    skippedUnresolvedOwnerSessions: 0,
    skippedAmbiguousPrivateSessions: 0,
    skippedInvalidPlatformIdMembers: 0,
    skippedFailedSessions: 0,
    warnings: [],
    ...overrides,
  }
}

test('does not show contacts disabled notice while the contacts response is still loading', () => {
  assert.equal(
    shouldShowContactsDisabledNotice({
      diagnostics: diagnostics({ activePrivateSessionCount: 0 }),
      showLoadingState: true,
    }),
    false
  )
})

test('shows contacts disabled notice after loading when active private sessions are below the threshold', () => {
  assert.equal(
    shouldShowContactsDisabledNotice({
      diagnostics: diagnostics({ activePrivateSessionCount: 0 }),
      showLoadingState: false,
    }),
    true
  )
})

test('does not show contacts disabled notice when contacts are enabled', () => {
  assert.equal(
    shouldShowContactsDisabledNotice({
      diagnostics: diagnostics({ activePrivateSessionCount: 11, contactsEnabled: true }),
      showLoadingState: false,
    }),
    false
  )
})
