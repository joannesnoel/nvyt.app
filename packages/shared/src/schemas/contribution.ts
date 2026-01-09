import { z } from 'zod'

export const contributionCategory = z.enum(['food', 'drinks', 'supplies', 'equipment', 'other'])

export const createContributionItemSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: contributionCategory.default('other'),
  quantityNeeded: z.number().int().positive().default(1),
})

export const updateContributionItemSchema = createContributionItemSchema.partial().omit({ eventId: true })

export const claimContributionSchema = z.object({
  contributionItemId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  notes: z.string().max(500).optional(),
})

export const updateClaimSchema = z.object({
  quantity: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
})

// Types
export type ContributionCategory = z.infer<typeof contributionCategory>
export type CreateContributionItemInput = z.infer<typeof createContributionItemSchema>
export type UpdateContributionItemInput = z.infer<typeof updateContributionItemSchema>
export type ClaimContributionInput = z.infer<typeof claimContributionSchema>
export type UpdateClaimInput = z.infer<typeof updateClaimSchema>
