import { eq } from 'drizzle-orm'
import { users } from '@nvyt/db'
import { z } from 'zod'
import { sendEmail } from '~/server/utils/email'

const bodySchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
})

// Allowlisted tags and attributes for HTML sanitization
const ALLOWED_TAGS = new Set(['p', 'strong', 'em', 's', 'ul', 'ol', 'li', 'a', 'br'])
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
}

function sanitizeHtml(html: string): string {
  // Remove all tags not in allowlist, strip disallowed attributes
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\/?>/gi, (match, tagName: string, attrs: string = '') => {
    const tag = tagName.toLowerCase()

    // Closing tag
    if (match.startsWith('</')) {
      return ALLOWED_TAGS.has(tag) ? `</${tag}>` : ''
    }

    if (!ALLOWED_TAGS.has(tag)) return ''

    const allowedAttrs = ALLOWED_ATTRS[tag]
    if (!allowedAttrs || !attrs.trim()) {
      const selfClose = match.endsWith('/>') ? ' /' : ''
      return `<${tag}${selfClose}>`
    }

    // Parse and filter attributes
    const cleanAttrs: string[] = []
    const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g
    let attrMatch
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase()
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''

      if (!allowedAttrs.has(attrName)) continue

      // Block javascript: URLs in href
      if (attrName === 'href' && /^\s*javascript\s*:/i.test(attrValue)) continue

      cleanAttrs.push(`${attrName}="${attrValue.replace(/"/g, '&quot;')}"`)
    }

    const selfClose = match.endsWith('/>') ? ' /' : ''
    const attrStr = cleanAttrs.length > 0 ? ' ' + cleanAttrs.join(' ') : ''
    return `<${tag}${attrStr}${selfClose}>`
  })
}

function wrapInEmailTemplate(bodyHtml: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
          <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
          <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
        </a>
      </div>

      <div style="font-size: 15px; color: #333;">
        ${bodyHtml}
      </div>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

      <p style="color: #666; font-size: 14px;">
        The NVYT&trade; Team
      </p>
    </body>
    </html>
  `
}

export default defineEventHandler(async (event) => {
  const admin = await requireAuth(event)
  requireAdmin(admin.email)

  const db = useDatabase()
  const userId = getRouterParam(event, 'userId')

  if (!userId) {
    throw createError({ statusCode: 400, message: 'User ID is required' })
  }

  const rawBody = await readBody(event)
  const parsed = bodySchema.safeParse(rawBody)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body',
      data: parsed.error.flatten(),
    })
  }

  const { subject, body } = parsed.data

  // Look up user
  const [targetUser] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // Sanitize and wrap in template
  const sanitizedBody = sanitizeHtml(body)
  const html = wrapInEmailTemplate(sanitizedBody)

  try {
    await sendEmail({
      to: targetUser.email,
      subject,
      html,
    })

    return successResponse({
      success: true,
      message: 'Email sent',
    })
  } catch (emailError) {
    console.error('[Admin Send Email] Failed to send email:', emailError)
    throw createError({
      statusCode: 500,
      message: 'Failed to send email',
    })
  }
})
