export const MIN_PRIVATE_SESSIONS_FOR_CONTACTS = 5
export const MIN_GROUP_SESSIONS_FOR_CONTACTS = 1

export interface ContactsEntryEnablementInput {
  privateSessionCount: number
  groupSessionCount: number
}

export function shouldEnableContactsEntry(input: ContactsEntryEnablementInput): boolean {
  return (
    input.groupSessionCount >= MIN_GROUP_SESSIONS_FOR_CONTACTS ||
    input.privateSessionCount >= MIN_PRIVATE_SESSIONS_FOR_CONTACTS
  )
}
