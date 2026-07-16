import * as crypto from 'node:crypto'

const PBKDF2_ITERATIONS = 600000
const SALT_LENGTH = 32
const HASH_LENGTH = 64
const HEX_PATTERN = /^[0-9a-f]+$/i

export interface PasswordHash {
  hash: string
  salt: string
  version: 1
}

export function isPasswordHash(value: unknown): value is PasswordHash {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.version === 1 &&
    typeof record.hash === 'string' &&
    record.hash.length === HASH_LENGTH * 2 &&
    HEX_PATTERN.test(record.hash) &&
    typeof record.salt === 'string' &&
    record.salt.length === SALT_LENGTH * 2 &&
    HEX_PATTERN.test(record.salt)
  )
}

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, HASH_LENGTH, 'sha512', (error, hash) => {
      if (error) reject(error)
      else resolve(hash)
    })
  })
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const hash = await derivePassword(password, salt)
  return {
    hash: hash.toString('hex'),
    salt: salt.toString('hex'),
    version: 1,
  }
}

export async function verifyPasswordHash(password: string, stored: PasswordHash): Promise<boolean> {
  if (!isPasswordHash(stored)) return false
  const expected = Buffer.from(stored.hash, 'hex')
  const actual = await derivePassword(password, Buffer.from(stored.salt, 'hex'))
  return crypto.timingSafeEqual(actual, expected)
}
