import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export * from './schema'

// Create a postgres connection
export function createConnection(connectionString: string) {
  // Enable SSL for RDS connections (don't verify self-signed AWS RDS certs)
  const isProduction = process.env.NODE_ENV === 'production'
  const client = postgres(connectionString, {
    ssl: isProduction ? { rejectUnauthorized: false } : false,
  })
  return drizzle(client, { schema })
}

// Type for the database instance
export type Database = ReturnType<typeof createConnection>
