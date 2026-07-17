import type { DatabaseAdapter } from '@openchatlab/core'

export interface WorkspaceDatabasePort {
  withDatabase<T>(filename: string, schemaSql: string, operation: (db: DatabaseAdapter) => T): Promise<T>
  deleteDatabase(filename: string): Promise<boolean>
  ensureCapacity(minimum: number): Promise<number>
  getDatabaseFilenames(): Promise<string[]>
}
