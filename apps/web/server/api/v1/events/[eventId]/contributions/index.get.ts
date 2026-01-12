import { contributionItems, contributionClaims, events, users } from '@nvyt/db'
import { eq, asc, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')

  if (!eventId) {
    throw createError({
      statusCode: 400,
      message: 'Event ID is required',
    })
  }

  const db = useDatabase()

  // Verify event exists and has contributions enabled
  const [eventRecord] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!eventRecord) {
    throw createError({
      statusCode: 404,
      message: 'Event not found',
    })
  }

  // Return empty array if contributions not enabled
  if (!eventRecord.contributionsEnabled) {
    return successResponse([])
  }

  // Get current user (optional - for showing their claims)
  const user = await getUserFromEvent(event)

  // Get all contribution items
  const items = await db
    .select()
    .from(contributionItems)
    .where(eq(contributionItems.eventId, eventId))
    .orderBy(asc(contributionItems.sortOrder), asc(contributionItems.createdAt))

  // Get claims for all items in one query
  const itemIds = items.map(item => item.id)

  let allClaims: any[] = []
  if (itemIds.length > 0) {
    allClaims = await db
      .select({
        claim: contributionClaims,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(contributionClaims)
      .leftJoin(users, eq(contributionClaims.userId, users.id))
      .where(inArray(contributionClaims.contributionItemId, itemIds))
  }

  // Group claims by item ID
  const claimsByItem = allClaims.reduce((acc, { claim, user: claimUser }) => {
    if (!acc[claim.contributionItemId]) {
      acc[claim.contributionItemId] = []
    }
    acc[claim.contributionItemId].push({
      ...claim,
      user: claimUser,
    })
    return acc
  }, {} as Record<string, any[]>)

  // Build response with claims
  const itemsWithClaims = items.map(item => {
    const claims = claimsByItem[item.id] || []
    const userClaim = user ? claims.find(c => c.userId === user.id) : null

    return {
      ...item,
      claims,
      userClaim,
      remainingNeeded: item.quantityNeeded - item.quantityClaimed,
      isFullyClaimed: item.quantityClaimed >= item.quantityNeeded,
    }
  })

  return successResponse(itemsWithClaims)
})
