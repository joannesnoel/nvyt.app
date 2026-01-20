import { psgcProvinces } from '@nvyt/db'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = useDatabase()

  const provinces = await db
    .select()
    .from(psgcProvinces)
    .orderBy(asc(psgcProvinces.name))

  return successResponse({
    provinces,
  })
})
