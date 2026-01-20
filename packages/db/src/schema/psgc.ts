import { pgTable, text, timestamp, boolean, index, serial } from 'drizzle-orm/pg-core'

// PSGC (Philippine Standard Geographic Code) tables
// Data source: https://github.com/pcofilada/psgc

export const psgcRegions = pgTable('psgc_regions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  designation: text('designation').notNull(), // e.g., "NCR", "Region I"
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const psgcProvinces = pgTable('psgc_provinces', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  regionName: text('region_name').notNull(), // References region designation
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('psgc_provinces_region_idx').on(table.regionName),
])

export const psgcCitiesMunicipalities = pgTable('psgc_cities_municipalities', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  provinceName: text('province_name').notNull(), // References province name
  isCity: boolean('is_city').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('psgc_cities_province_idx').on(table.provinceName),
])

export const psgcBarangays = pgTable('psgc_barangays', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // PSGC code from data
  name: text('name').notNull(),
  cityMunName: text('city_mun_name').notNull(), // References city/municipality name
  provinceName: text('province_name').notNull(), // References province name (for disambiguation)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('psgc_barangays_city_mun_province_idx').on(table.cityMunName, table.provinceName),
])

// Types
export type PSGCRegion = typeof psgcRegions.$inferSelect
export type NewPSGCRegion = typeof psgcRegions.$inferInsert
export type PSGCProvince = typeof psgcProvinces.$inferSelect
export type NewPSGCProvince = typeof psgcProvinces.$inferInsert
export type PSGCCityMunicipality = typeof psgcCitiesMunicipalities.$inferSelect
export type NewPSGCCityMunicipality = typeof psgcCitiesMunicipalities.$inferInsert
export type PSGCBarangay = typeof psgcBarangays.$inferSelect
export type NewPSGCBarangay = typeof psgcBarangays.$inferInsert
