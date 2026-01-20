import { psgcCitiesMunicipalities } from '@nvyt/db'
import { eq, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const provinceName = query.provinceName as string

  if (!provinceName) {
    throw createError({
      statusCode: 400,
      message: 'Province name is required',
    })
  }

  const db = useDatabase()

  const cities = await db
    .select()
    .from(psgcCitiesMunicipalities)
    .where(eq(psgcCitiesMunicipalities.provinceName, provinceName))
    .orderBy(asc(psgcCitiesMunicipalities.name))

  return successResponse({
    cities,
  })
})
