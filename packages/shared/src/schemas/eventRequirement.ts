import { z } from 'zod'

export const requirementType = z.enum(['checkbox', 'yes_no'])

export const createEventRequirementSchema = z.object({
  eventId: z.string().uuid(),
  type: requirementType,
  text: z.string().min(1).max(500),
  description: z.string().max(1000).optional(),
  requiredAnswer: z.boolean().optional(), // For yes_no type
})

export const updateEventRequirementSchema = createEventRequirementSchema
  .partial()
  .omit({ eventId: true })

export const reorderRequirementsSchema = z.object({
  requirementIds: z.array(z.string().uuid()),
})

// Schema for requirement responses during checkout
export const requirementResponseSchema = z.object({
  requirementId: z.string().uuid(),
  response: z.boolean(), // true = agreed/yes, false = disagree/no
})

export const requirementResponsesSchema = z.array(requirementResponseSchema)

// Types
export type RequirementType = z.infer<typeof requirementType>
export type CreateEventRequirementInput = z.infer<typeof createEventRequirementSchema>
export type UpdateEventRequirementInput = z.infer<typeof updateEventRequirementSchema>
export type RequirementResponse = z.infer<typeof requirementResponseSchema>
