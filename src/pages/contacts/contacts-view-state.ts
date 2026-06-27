import type { ContactsDiagnostics } from '@openchatlab/shared-types'

export interface ContactsDisabledNoticeState {
  diagnostics: ContactsDiagnostics | null | undefined
  showLoadingState: boolean
}

export function shouldShowContactsDisabledNotice(state: ContactsDisabledNoticeState): boolean {
  return !!state.diagnostics && !state.showLoadingState && !state.diagnostics.contactsEnabled
}
