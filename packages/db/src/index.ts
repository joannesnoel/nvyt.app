import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export * from './schema'

// Create a postgres connection
export function createConnection(connectionString: string, options?: { ssl?: boolean }) {
  // SSL can be explicitly set via options, or defaults based on environment
  // Use DB_SSL env var to override, or fall back to NODE_ENV check
  const sslEnv = process.env.DB_SSL
  const useSSL = options?.ssl ?? (sslEnv !== undefined ? sslEnv === 'true' : process.env.NODE_ENV === 'production')

  const client = postgres(connectionString, {
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  })
  return drizzle(client, { schema })
}

// Type for the database instance
export type Database = ReturnType<typeof createConnection>
