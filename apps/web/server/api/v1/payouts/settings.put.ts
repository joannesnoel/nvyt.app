import { eq } from 'drizzle-orm'
import { payoutSettings } from '@nvyt/db'
import { z } from 'zod'

const settingsSchema = z.object({
  bankName: z.string().min(1, 'Bank name is required').max(100),
  accountName: z.string().min(1, 'Account name is required').max(100),
  accountNumber: z.string().min(6, 'Account number must be at least 6 characters').max(30),
})

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)
  const userId = user.id
  const db = useDatabase()

  // Parse request body
  const body = await readBody(event)
  const result = settingsSchema.safeParse(body)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request data',
      data: result.error.flatten(),
    })
  }

  const { bankName, accountName, accountNumber } = result.data

  // Check if settings already exist
  const [existingSettings] = await db
    .select()
    .from(payoutSettings)
    .where(eq(payoutSettings.userId, userId))
    .limit(1)

  let settings
  if (existingSettings) {
    // Update existing settings
    const [updated] = await db
      .update(payoutSettings)
      .set({
        bankName,
        accountName,
        accountNumber,
        updatedAt: new Date(),
      })
      .where(eq(payoutSettings.id, existingSettings.id))
      .returning()
    settings = updated
  } else {
    // Create new settings
    const [created] = await db
      .insert(payoutSettings)
      .values({
        userId,
        bankName,
        accountName,
        accountNumber,
      })
      .returning()
    settings = created
  }

  if (!settings) {
    throw createError({
      statusCode: 500,
      message: 'Failed to save payout settings',
    })
  }

  // Mask account number for response
  const maskedAccountNumber = '****' + accountNumber.slice(-4)

  return successResponse({
    settings: {
      id: settings.id,
      bankName: settings.bankName,
      accountName: settings.accountName,
      accountNumber: maskedAccountNumber,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    },
    message: 'Payout settings updated successfully',
  })
})
