import { createConnection, type Database } from '@nvyt/db'

let db: Database | null = null

export function useDatabase(): Database {
  if (!db) {
    const config = useRuntimeConfig()
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is not configured')
    }
    db = createConnection(config.databaseUrl)
  }
  return db
}
