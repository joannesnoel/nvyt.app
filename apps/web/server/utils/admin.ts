/**
 * Get list of admin emails from runtime config
 */
export function getAdminEmails(): string[] {
  const config = useRuntimeConfig()
  const adminEmails = config.adminEmails || ''

  if (!adminEmails) {
    return []
  }

  return adminEmails
    .split(',')
    .map((email: string) => email.trim().toLowerCase())
    .filter((email: string) => email.length > 0)
}

/**
 * Check if a user email is an admin
 */
export function isAdmin(email: string): boolean {
  const adminEmails = getAdminEmails()
  return adminEmails.includes(email.toLowerCase())
}

/**
 * Require admin access - throws 403 if not admin
 */
export function requireAdmin(userEmail: string): void {
  if (!isAdmin(userEmail)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }
}
