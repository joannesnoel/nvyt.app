#!/usr/bin/env npx tsx
/**
 * Development Reset Script
 *
 * This script clears all data from the database and S3 storage for a fresh start.
 *
 * Usage:
 *   pnpm run reset:dev
 *
 * Environment variables required:
 *   DATABASE_URL - PostgreSQL connection string
 *   S3_ENDPOINT - S3/Garage endpoint URL
 *   S3_ACCESS_KEY_ID - S3 access key
 *   S3_SECRET_ACCESS_KEY - S3 secret key
 *   S3_BUCKET - S3 bucket name
 */

import postgres from 'postgres'
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load environment variables from .env in root
config({ path: resolve(__dirname, '../.env') })

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message: string, color: keyof typeof COLORS = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`)
}

async function confirmAction(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(
      `${COLORS.yellow}Are you sure you want to reset the database and storage? This cannot be undone! (yes/no): ${COLORS.reset}`,
      (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'yes')
      }
    )
  })
}

async function resetDatabase() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  log('\n[Database] Connecting...', 'blue')
  const sql = postgres(databaseUrl)

  try {
    // Get all table names in the public schema
    const tables = await sql`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
    `

    if (tables.length === 0) {
      log('[Database] No tables found to drop', 'yellow')
      await sql.end()
      return
    }

    log(`[Database] Found ${tables.length} tables to drop`, 'cyan')

    // Drop all tables with CASCADE
    for (const { tablename } of tables) {
      log(`[Database] Dropping table: ${tablename}`, 'cyan')
      await sql.unsafe(`DROP TABLE IF EXISTS "${tablename}" CASCADE`)
    }

    // Also drop any custom types/enums
    const enums = await sql`
      SELECT typname FROM pg_type
      WHERE typtype = 'e'
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    `

    for (const { typname } of enums) {
      log(`[Database] Dropping enum: ${typname}`, 'cyan')
      await sql.unsafe(`DROP TYPE IF EXISTS "${typname}" CASCADE`)
    }

    // Drop drizzle migration tracking schema
    log('[Database] Dropping drizzle migration schema...', 'cyan')
    await sql.unsafe(`DROP SCHEMA IF EXISTS drizzle CASCADE`)

    log('[Database] All tables and enums dropped successfully', 'green')
  } finally {
    await sql.end()
  }
}

async function clearS3Storage() {
  const endpoint = process.env.S3_ENDPOINT
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  const bucket = process.env.S3_BUCKET || 'nvyt-uploads'
  const region = process.env.S3_REGION || 'garage'

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    log('\n[Storage] S3 not configured, skipping storage cleanup', 'yellow')
    return
  }

  log('\n[Storage] Connecting to S3...', 'blue')

  const s3Client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  })

  try {
    let totalDeleted = 0
    let continuationToken: string | undefined

    // List and delete all objects (handling pagination)
    do {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        })
      )

      const objects = listResponse.Contents || []

      if (objects.length > 0) {
        log(`[Storage] Found ${objects.length} objects to delete`, 'cyan')

        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: objects.map((obj) => ({ Key: obj.Key })),
              Quiet: true,
            },
          })
        )

        totalDeleted += objects.length
      }

      continuationToken = listResponse.NextContinuationToken
    } while (continuationToken)

    if (totalDeleted > 0) {
      log(`[Storage] Deleted ${totalDeleted} objects from bucket "${bucket}"`, 'green')
    } else {
      log(`[Storage] No objects found in bucket "${bucket}"`, 'yellow')
    }
  } catch (error: any) {
    if (error.name === 'NoSuchBucket') {
      log(`[Storage] Bucket "${bucket}" does not exist, skipping`, 'yellow')
    } else {
      throw error
    }
  }
}

async function runMigrations() {
  log('\n[Migrations] Pushing database schema...', 'blue')

  const { execSync } = await import('child_process')

  try {
    // Use db:push to directly sync the schema (more reliable for fresh databases)
    // --force auto-approves all statements
    execSync('npx drizzle-kit push --force', {
      cwd: resolve(__dirname, '../packages/db'),
      stdio: 'inherit',
    })
    log('[Migrations] Schema pushed successfully', 'green')
  } catch (error) {
    log('[Migrations] Failed to push schema', 'red')
    throw error
  }
}

async function main() {
  log('========================================', 'yellow')
  log('     NVYT Development Reset Script     ', 'yellow')
  log('========================================', 'yellow')
  log('')
  log('This will:', 'cyan')
  log('  1. Drop ALL tables from the database', 'cyan')
  log('  2. Delete ALL files from S3 storage', 'cyan')
  log('  3. Re-run database migrations', 'cyan')
  log('')

  // Check for --force flag to skip confirmation
  const force = process.argv.includes('--force') || process.argv.includes('-f')

  if (!force) {
    const confirmed = await confirmAction()
    if (!confirmed) {
      log('\nOperation cancelled.', 'yellow')
      process.exit(0)
    }
  }

  log('\nStarting reset...', 'blue')

  try {
    await resetDatabase()
    await clearS3Storage()
    await runMigrations()

    log('\n========================================', 'green')
    log('     Reset completed successfully!     ', 'green')
    log('========================================', 'green')
  } catch (error) {
    log(`\nError during reset: ${error}`, 'red')
    process.exit(1)
  }
}

main()
