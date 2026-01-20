import { psgcBarangays } from '@nvyt/db'
import { eq, asc, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cityMunName = query.cityMunName as string
  const provinceName = query.provinceName as string

  if (!cityMunName) {
    throw createError({
      statusCode: 400,
      message: 'City/Municipality name is required',
    })
  }

  if (!provinceName) {
    throw createError({
      statusCode: 400,
      message: 'Province name is required',
    })
  }

  const db = useDatabase()

  const barangays = await db
    .select()
    .from(psgcBarangays)
    .where(and(
      eq(psgcBarangays.cityMunName, cityMunName),
      eq(psgcBarangays.provinceName, provinceName)
    ))
    .orderBy(asc(psgcBarangays.name))

  return successResponse({
    barangays,
  })
})
