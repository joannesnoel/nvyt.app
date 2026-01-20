import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
config({ path: resolve(__dirname, '../../../.env') })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const sql = postgres(connectionString)

async function dropTables() {
  console.log('Dropping old PSGC tables...')
  await sql`DROP TABLE IF EXISTS psgc_barangays CASCADE`
  await sql`DROP TABLE IF EXISTS psgc_cities_municipalities CASCADE`
  await sql`DROP TABLE IF EXISTS psgc_provinces CASCADE`
  await sql`DROP TABLE IF EXISTS psgc_regions CASCADE`
  console.log('Tables dropped!')
  await sql.end()
  process.exit(0)
}

dropTables()
