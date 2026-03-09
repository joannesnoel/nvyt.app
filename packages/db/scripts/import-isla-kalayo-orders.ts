import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import nodemailer from 'nodemailer'
import { users, accountSetupTokens } from '../src/schema/users'
import { orders, tickets, ticketTypes } from '../src/schema/tickets'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load env from project root
config({ path: resolve(__dirname, '../../../.env') })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

// --- Config ---
const EVENT_ID = '3f15610b-09bf-4eff-850d-500a00099b71'
const EVENT_TITLE = 'Isla Kalayo Kwatro 2026'
const EVENT_DATE = 'Saturday, April 18, 2026 at 9:00 AM'
const EVENT_LOCATION = "JJ's Backpackers Village, Siquijor Circumferential Rd, Solangon, San Juan, 6227 Siquijor, Philippines"
const APP_URL = process.env.APP_URL || process.env.NUXT_PUBLIC_APP_URL || 'https://nvyt.app'
const SMTP_HOST = process.env.SMTP_HOST || ''
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10)
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'
const SMTP_FROM = process.env.SMTP_FROM || 'NVYT <noreply@nvyt.app>'
const SETUP_TOKEN_EXPIRY_DAYS = 30

const TICKET_TYPE_MAP: Record<string, { id: string; price: number }> = {
  'Early Bird: P250/ Tickets': { id: 'fb78babc-4fda-4507-94e8-608ec48de3ed', price: 250 },
  'Pre-Sale: 350/ Ticket': { id: '5732a5ec-d796-4f1a-8420-644253185259', price: 350 },
}

// --- Helpers ---
function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = nanoid(6).toUpperCase()
  return `NVYT-${timestamp}-${random}`
}

function generateTicketNumber(): string {
  return `TKT-${nanoid(10).toUpperCase()}`
}

function generateQRCode(): string {
  return nanoid(32)
}

interface CsvRow {
  name: string
  email: string
  ticketCount: number
  ticketType: string
}

function parseCsv(filePath: string): CsvRow[] {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')
  // Skip header
  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    // CSV format: Name,Email Address,# Tickets,Ticket Type
    const parts = line.split(',')
    if (parts.length < 4) {
      console.warn(`Skipping malformed line ${i + 1}: ${line}`)
      continue
    }
    const name = parts[0].trim()
    const email = parts[1].trim().toLowerCase()
    const ticketCount = parseInt(parts[2].trim(), 10)
    const ticketType = parts.slice(3).join(',').trim() // rejoin in case type has commas
    if (isNaN(ticketCount) || ticketCount <= 0) {
      console.warn(`Skipping line ${i + 1}: invalid ticket count`)
      continue
    }
    if (!TICKET_TYPE_MAP[ticketType]) {
      console.error(`Unknown ticket type on line ${i + 1}: "${ticketType}"`)
      process.exit(1)
    }
    rows.push({ name, email, ticketCount, ticketType })
  }
  return rows
}

// --- Email ---
function buildTicketReadyEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  orderNumber: string
  ticketCount: number
  ticketSummary: Array<{ ticketType: string; quantity: number }>
  totalAmount: string
  orderUrl: string
  setupToken?: string
}): { subject: string; html: string } {
  const ticketViewUrl = data.setupToken
    ? `${data.orderUrl}/success?token=${data.setupToken}`
    : data.orderUrl

  const ticketSummaryHtml = data.ticketSummary
    .map(t => `<li style="margin-bottom: 4px;">${t.quantity}x ${t.ticketType}</li>`)
    .join('')

  const ticketWord = data.ticketCount === 1 ? 'ticket' : 'tickets'
  const heading = data.ticketCount === 1
    ? 'Your digital ticket is ready!'
    : 'Your digital tickets are ready!'
  const accessNote = `<p style="color: #666; font-size: 14px; text-align: center;">Your ${ticketWord} and QR codes are available in your order page.</p>`

  return {
    subject: `Your digital ${ticketWord} ${data.ticketCount === 1 ? 'is' : 'are'} ready - ${data.eventTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; background: #dcfce7; border-radius: 50%; padding: 16px;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
          </div>

          <h1 style="font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 8px 0;">${heading}</h1>
          <p style="text-align: center; color: #666; margin: 0 0 24px 0;">Hi ${data.userName}, your ${ticketWord} for ${data.eventTitle} ${data.ticketCount === 1 ? 'is' : 'are'} confirmed.</p>

          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 12px 0; font-size: 16px;">${data.eventTitle}</h3>
            <p style="margin: 0 0 4px 0; color: #666; font-size: 14px;">${data.eventDate}</p>
            <p style="margin: 0; color: #666; font-size: 14px;">${data.eventLocation}</p>
          </div>

          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px;">Order Summary</p>
            <p style="margin: 0 0 4px 0; color: #666; font-size: 14px;">Order: ${data.orderNumber}</p>
            <ul style="margin: 8px 0; padding-left: 20px; color: #666; font-size: 14px;">${ticketSummaryHtml}</ul>
            <p style="margin: 8px 0 0 0; font-weight: 600; font-size: 14px;">Total: ${data.totalAmount}</p>
          </div>

          ${accessNote}

          <div style="text-align: center; margin: 20px 0;">
            <a href="${ticketViewUrl}" style="display: inline-block; background: #000; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600;">View Your Tickets</a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="text-align: center; color: #9ca3af; font-size: 12px; margin: 0;">
            This email was sent by <a href="https://nvyt.app" style="color: #9ca3af;">nvyt.app</a>
          </p>
        </div>
      </body>
      </html>
    `,
  }
}

let smtpTransporter: nodemailer.Transporter | null = null

function getSmtpTransporter(): nodemailer.Transporter | null {
  if (smtpTransporter) return smtpTransporter
  if (!SMTP_HOST) return null

  const options: Record<string, any> = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
  }

  if (SMTP_USER) {
    options.auth = { user: SMTP_USER, pass: SMTP_PASS }
  }

  smtpTransporter = nodemailer.createTransport(options)
  return smtpTransporter
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = getSmtpTransporter()
  if (!transporter) {
    console.warn(`  [Email] No SMTP configured, skipping email to ${to}`)
    return false
  }
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
    })
    console.log(`  [Email] Sent to ${to} (id: ${info.messageId})`)
    return true
  } catch (error) {
    console.error(`  [Email] Failed to send to ${to}:`, error)
    return false
  }
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2)
  const csvPath = args.find(a => !a.startsWith('--'))
  const executeMode = args.includes('--execute')

  if (!csvPath) {
    console.error('Usage: tsx scripts/import-isla-kalayo-orders.ts <csv-path> [--execute]')
    process.exit(1)
  }

  console.log(`Mode: ${executeMode ? 'EXECUTE (will commit changes)' : 'DRY-RUN (will rollback)'}`)
  console.log(`CSV: ${csvPath}\n`)

  const rows = parseCsv(csvPath)
  console.log(`Parsed ${rows.length} orders from CSV`)

  const totalTickets = rows.reduce((sum, r) => sum + r.ticketCount, 0)
  console.log(`Total tickets to import: ${totalTickets}\n`)

  const client = postgres(connectionString!)
  const db = drizzle(client)

  // Track ticket type counts for quantitySold update
  const ticketTypeCounts: Record<string, number> = {}

  // Track results for summary
  const results: Array<{
    name: string
    email: string
    orderNumber: string
    ticketCount: number
    ticketType: string
    userId: string
    isNewUser: boolean
    needsSetupToken: boolean
  }> = []

  try {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const ttConfig = TICKET_TYPE_MAP[row.ticketType]

        // 1. Find or create user
        const [existingUser] = await tx
          .select()
          .from(users)
          .where(eq(users.email, row.email))
          .limit(1)

        let userId: string
        let isNewUser = false
        let needsSetupToken = false

        if (existingUser) {
          userId = existingUser.id
          // Guest user (no password) still needs setup token
          needsSetupToken = !existingUser.passwordHash
          console.log(`  User found: ${row.email} (${existingUser.name})`)
        } else {
          const [newUser] = await tx
            .insert(users)
            .values({
              name: row.name,
              email: row.email,
              passwordHash: null,
              emailVerified: false,
            })
            .returning()
          userId = newUser.id
          isNewUser = true
          needsSetupToken = true
          console.log(`  User created: ${row.email} (${row.name})`)
        }

        // 2. Create order
        const orderNumber = generateOrderNumber()
        const totalAmount = ttConfig.price * row.ticketCount

        const [order] = await tx
          .insert(orders)
          .values({
            eventId: EVENT_ID,
            userId,
            orderNumber,
            subtotalAmount: String(totalAmount),
            processingFee: '0',
            adminFee: '0',
            totalFees: '0',
            totalAmount: String(totalAmount),
            currency: 'PHP',
            discountAmount: '0',
            paymentMethod: 'external',
            paymentProvider: 'external',
            paymentStatus: 'paid',
            paidAt: new Date(),
            customerName: row.name,
            customerEmail: row.email,
          })
          .returning()

        console.log(`  Order created: ${orderNumber} (${row.ticketCount}x ${row.ticketType} = PHP ${totalAmount})`)

        // 3. Create tickets
        const ticketValues = []
        for (let i = 0; i < row.ticketCount; i++) {
          ticketValues.push({
            ticketTypeId: ttConfig.id,
            eventId: EVENT_ID,
            userId,
            orderId: order.id,
            ticketNumber: generateTicketNumber(),
            qrCode: generateQRCode(),
            status: 'confirmed' as const,
            pricePaid: String(ttConfig.price),
            sortOrder: i,
          })
        }
        await tx.insert(tickets).values(ticketValues)

        // Track counts
        ticketTypeCounts[ttConfig.id] = (ticketTypeCounts[ttConfig.id] || 0) + row.ticketCount

        results.push({
          name: row.name,
          email: row.email,
          orderNumber,
          ticketCount: row.ticketCount,
          ticketType: row.ticketType,
          userId,
          isNewUser,
          needsSetupToken,
        })
      }

      // 4. Update quantitySold for each ticket type
      for (const [ticketTypeId, count] of Object.entries(ticketTypeCounts)) {
        await tx
          .update(ticketTypes)
          .set({
            quantitySold: sql`${ticketTypes.quantitySold} + ${count}`,
            updatedAt: new Date(),
          })
          .where(eq(ticketTypes.id, ticketTypeId))
        console.log(`  Updated quantitySold for ${ticketTypeId}: +${count}`)
      }

      if (!executeMode) {
        console.log('\n--- DRY-RUN: Rolling back transaction ---')
        throw new Error('DRY_RUN_ROLLBACK')
      }
    })
  } catch (err: any) {
    if (err.message === 'DRY_RUN_ROLLBACK') {
      // Expected in dry-run mode
    } else {
      throw err
    }
  }

  // 5. Send confirmation emails (only in execute mode)
  if (executeMode) {
    console.log('\n--- Sending confirmation emails ---')
    for (const result of results) {
      let setupToken: string | undefined

      // Create setup token for users without passwords
      if (result.needsSetupToken) {
        const token = nanoid(32)
        const expiresAt = new Date(Date.now() + SETUP_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

        // Invalidate existing unused tokens
        await db
          .update(accountSetupTokens)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(accountSetupTokens.userId, result.userId),
              isNull(accountSetupTokens.usedAt)
            )
          )

        await db.insert(accountSetupTokens).values({
          userId: result.userId,
          token,
          expiresAt,
        })

        setupToken = token
      }

      const ttConfig = TICKET_TYPE_MAP[result.ticketType]
      const totalAmount = `PHP ${(ttConfig.price * result.ticketCount).toLocaleString()}`
      const orderUrl = `${APP_URL}/orders/${result.orderNumber}`

      const emailContent = buildTicketReadyEmail({
        userName: result.name,
        eventTitle: EVENT_TITLE,
        eventDate: EVENT_DATE,
        eventLocation: EVENT_LOCATION,
        orderNumber: result.orderNumber,
        ticketCount: result.ticketCount,
        ticketSummary: [{ ticketType: result.ticketType, quantity: result.ticketCount }],
        totalAmount,
        orderUrl,
        setupToken,
      })

      await sendEmail(result.email, emailContent.subject, emailContent.html)

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 200))
    }
  }

  // Summary
  console.log('\n=== Summary ===')
  console.log(`Orders: ${results.length}`)
  console.log(`Tickets: ${totalTickets}`)
  for (const [type, config] of Object.entries(TICKET_TYPE_MAP)) {
    const count = ticketTypeCounts[config.id] || 0
    console.log(`  ${type}: ${count} tickets`)
  }
  if (!executeMode) {
    console.log('\nThis was a DRY RUN. Run with --execute to commit changes and send emails.')
  }

  await client.end()
  process.exit(0)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
