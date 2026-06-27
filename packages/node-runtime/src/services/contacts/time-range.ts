import {
  CONTACTS_TIME_RANGE_PRESETS,
  type ContactsTimeRangePreset,
  type ContactsTimeRangeState,
} from '@openchatlab/shared-types'

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60
const DEFAULT_CONTACTS_TIME_RANGE_PRESET: ContactsTimeRangePreset = '1y'

const YEARS_BY_PRESET: Partial<Record<ContactsTimeRangePreset, number>> = {
  '1y': 1,
  '2y': 2,
  '3y': 3,
  '5y': 5,
}

export function normalizeContactsTimeRangePreset(value: unknown): ContactsTimeRangePreset {
  return CONTACTS_TIME_RANGE_PRESETS.includes(value as ContactsTimeRangePreset)
    ? (value as ContactsTimeRangePreset)
    : DEFAULT_CONTACTS_TIME_RANGE_PRESET
}

export function resolveContactsTimeRange(
  presetInput: unknown,
  anchorTs: number | null | undefined
): ContactsTimeRangeState {
  const preset = normalizeContactsTimeRangePreset(presetInput)
  const normalizedAnchor = typeof anchorTs === 'number' ? anchorTs : null
  const years = YEARS_BY_PRESET[preset]

  return {
    preset,
    anchorTs: normalizedAnchor,
    startTs: normalizedAnchor !== null && years ? normalizedAnchor - years * SECONDS_PER_YEAR : null,
  }
}
