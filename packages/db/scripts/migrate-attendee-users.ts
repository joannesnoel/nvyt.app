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

interface TicketWithAttendee {
  id: string
  attendee_email: string
  attendee_name: string | null
  attendee_birthdate: string | null
}

interface User {
  id: string
  email: string
  name: string
  birthdate: string | null
}

async function migrateAttendeeUsers() {
  console.log('Starting attendee user migration...')

  // Find all tickets with attendee_email that don't have attendee_user_id set
  const ticketsToMigrate = await sql<TicketWithAttendee[]>`
    SELECT id, attendee_email, attendee_name, attendee_birthdate
    FROM tickets
    WHERE attendee_email IS NOT NULL
      AND attendee_user_id IS NULL
      AND registration_completed = true
  `

  console.log(`Found ${ticketsToMigrate.length} tickets to migrate`)

  if (ticketsToMigrate.length === 0) {
    console.log('No tickets need migration')
    await sql.end()
    process.exit(0)
  }

  // Group tickets by email to process each unique email once
  const ticketsByEmail = new Map<string, TicketWithAttendee[]>()
  for (const ticket of ticketsToMigrate) {
    const email = ticket.attendee_email.toLowerCase()
    if (!ticketsByEmail.has(email)) {
      ticketsByEmail.set(email, [])
    }
    ticketsByEmail.get(email)!.push(ticket)
  }

  console.log(`Processing ${ticketsByEmail.size} unique attendee emails`)

  let usersCreated = 0
  let usersUpdated = 0
  let ticketsUpdated = 0

  for (const [email, tickets] of ticketsByEmail) {
    // Get the best name and birthdate from the tickets
    // Prefer non-null values, use the most recent ticket's data
    const latestTicket = tickets[0]
    const attendeeName = latestTicket.attendee_name || ''
    const attendeeBirthdate = latestTicket.attendee_birthdate

    // Check if user already exists
    const existingUsers = await sql<User[]>`
      SELECT id, email, name, birthdate
      FROM users
      WHERE LOWER(email) = ${email}
      LIMIT 1
    `

    let userId: string

    if (existingUsers.length > 0) {
      // User exists - update birthdate if not set
      const existingUser = existingUsers[0]
      userId = existingUser.id

      if (!existingUser.birthdate && attendeeBirthdate) {
        await sql`
          UPDATE users
          SET birthdate = ${attendeeBirthdate}, updated_at = NOW()
          WHERE id = ${userId}
        `
        usersUpdated++
        console.log(`  Updated user ${email} with birthdate`)
      }
    } else {
      // Create new user
      const newUsers = await sql<{ id: string }[]>`
        INSERT INTO users (email, name, birthdate)
        VALUES (${email}, ${attendeeName}, ${attendeeBirthdate})
        RETURNING id
      `
      userId = newUsers[0].id
      usersCreated++
      console.log(`  Created user ${email}`)
    }

    // Update all tickets for this email
    const ticketIds = tickets.map(t => t.id)
    await sql`
      UPDATE tickets
      SET attendee_user_id = ${userId}, updated_at = NOW()
      WHERE id = ANY(${ticketIds})
    `
    ticketsUpdated += tickets.length
  }

  console.log('\nMigration complete!')
  console.log(`  Users created: ${usersCreated}`)
  console.log(`  Users updated: ${usersUpdated}`)
  console.log(`  Tickets updated: ${ticketsUpdated}`)

  await sql.end()
  process.exit(0)
}

migrateAttendeeUsers().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
