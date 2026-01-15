// Lightweight migration runner using postgres.js
// This runs Drizzle-generated SQL migrations against the database

import postgres from 'postgres';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

console.log('='.repeat(50));
console.log('nvyt.app Database Migration Runner');
console.log('='.repeat(50));
console.log('Connecting to database...');

const sql = postgres(DATABASE_URL, {
  max: 1,
  onnotice: () => {}, // Suppress notices
});

async function run() {
  try {
    // Create drizzle migrations table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `;

    // Get already applied migrations
    const applied = await sql`SELECT hash FROM "__drizzle_migrations"`;
    const appliedHashes = new Set(applied.map(r => r.hash));
    console.log(`Found ${appliedHashes.size} previously applied migrations\n`);

    // Read the journal to get migration order
    const journalPath = './migrations/meta/_journal.json';
    if (!existsSync(journalPath)) {
      console.error('ERROR: Migration journal not found at', journalPath);
      process.exit(1);
    }

    const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
    const migrations = journal.entries;

    let applied_count = 0;
    let skipped_count = 0;

    for (const migration of migrations) {
      const hash = migration.tag;
      const sqlFile = `./migrations/${hash}.sql`;

      if (appliedHashes.has(hash)) {
        console.log(`[SKIP] ${hash} (already applied)`);
        skipped_count++;
        continue;
      }

      if (!existsSync(sqlFile)) {
        console.error(`ERROR: Migration file not found: ${sqlFile}`);
        process.exit(1);
      }

      console.log(`[RUN]  ${hash}...`);
      const content = readFileSync(sqlFile, 'utf-8');

      // Split by Drizzle's statement breakpoint marker
      const statements = content
        .split('--> statement-breakpoint')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      // Execute each statement
      for (const statement of statements) {
        try {
          await sql.unsafe(statement);
        } catch (err) {
          console.error(`\nERROR executing statement in ${hash}:`);
          console.error(statement.substring(0, 200) + '...');
          console.error('\nError:', err.message);
          process.exit(1);
        }
      }

      // Record the migration
      await sql`
        INSERT INTO "__drizzle_migrations" (hash, created_at)
        VALUES (${hash}, ${Date.now()})
      `;

      console.log(`       ${hash} applied successfully (${statements.length} statements)`);
      applied_count++;
    }

    console.log('\n' + '='.repeat(50));
    console.log(`Migration complete!`);
    console.log(`  Applied: ${applied_count}`);
    console.log(`  Skipped: ${skipped_count}`);
    console.log('='.repeat(50));

    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    await sql.end();
    process.exit(1);
  }
}

run();
