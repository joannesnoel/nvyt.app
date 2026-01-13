import { eq } from 'drizzle-orm'
import { payoutSettings } from '@nvyt/db'

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await requireAuth(event)
  const userId = user.id
  const db = useDatabase()

  // Get payout settings
  const [settings] = await db
    .select()
    .from(payoutSettings)
    .where(eq(payoutSettings.userId, userId))
    .limit(1)

  if (!settings) {
    return successResponse({
      settings: null,
      isConfigured: false,
    })
  }

  // Mask account number for security (show last 4 digits only)
  const maskedAccountNumber = settings.accountNumber
    ? '****' + settings.accountNumber.slice(-4)
    : null

  return successResponse({
    settings: {
      id: settings.id,
      bankName: settings.bankName,
      accountName: settings.accountName,
      accountNumber: maskedAccountNumber,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    },
    isConfigured: !!(settings.bankName && settings.accountName && settings.accountNumber),
  })
})
