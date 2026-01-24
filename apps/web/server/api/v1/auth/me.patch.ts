import { users } from '@nvyt/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  // Password change (all three required together)
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
  confirmNewPassword: z.string().optional(),
}).refine((data) => {
  // If any password field is provided, all must be provided
  const hasAnyPassword = data.currentPassword || data.newPassword || data.confirmNewPassword
  if (hasAnyPassword) {
    return data.currentPassword && data.newPassword && data.confirmNewPassword
  }
  return true
}, {
  message: 'All password fields are required to change password',
  path: ['currentPassword'],
}).refine((data) => {
  // Passwords must match
  if (data.newPassword && data.confirmNewPassword) {
    return data.newPassword === data.confirmNewPassword
  }
  return true
}, {
  message: 'New passwords do not match',
  path: ['confirmNewPassword'],
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  // Validate input
  const result = updateProfileSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: result.error.flatten(),
    })
  }

  const { name, birthdate, avatarUrl, currentPassword, newPassword } = result.data
  const db = useDatabase()

  // Build update data
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (name !== undefined) {
    updateData.name = name
  }

  if (birthdate !== undefined) {
    updateData.birthdate = birthdate
  }

  if (avatarUrl !== undefined) {
    updateData.avatarUrl = avatarUrl
  }

  // Handle password change
  if (currentPassword && newPassword) {
    // Get current user with password hash
    const [currentUser] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)

    if (!currentUser?.passwordHash) {
      throw createError({
        statusCode: 400,
        message: 'Cannot change password for OAuth accounts. Please use your social login provider.',
      })
    }

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, currentUser.passwordHash)
    if (!isValidPassword) {
      throw createError({
        statusCode: 400,
        message: 'Current password is incorrect',
      })
    }

    // Hash new password
    updateData.passwordHash = await hashPassword(newPassword)
  }

  // Update user
  const [updatedUser] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, user.id))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      birthdate: users.birthdate,
      avatarUrl: users.avatarUrl,
      emailVerified: users.emailVerified,
    })

  if (!updatedUser) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update profile',
    })
  }

  return successResponse({
    user: updatedUser,
    message: 'Profile updated successfully',
  })
})
