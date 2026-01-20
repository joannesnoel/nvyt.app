import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { psgcRegions, psgcProvinces, psgcCitiesMunicipalities, psgcBarangays } from '../src/schema/psgc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load env from project root
config({ path: resolve(__dirname, '../../../.env') })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const client = postgres(connectionString)
const db = drizzle(client)

// GitHub raw URLs for PSGC data
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/pcofilada/psgc/master/src/data'

interface Region {
  name: string
  designation: string
}

interface Province {
  name: string
  region: string // designation of region
}

interface Municipality {
  name: string
  province: string // name of province
  city: boolean
}

interface Barangay {
  code: string
  name: string
  citymun: string // name of city/municipality
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

// Normalize city/municipality name from barangay data to match municipalities data
function normalizeCityMunName(citymun: string, municipalityNames: Set<string>): string {
  // First try exact match
  if (municipalityNames.has(citymun)) {
    return citymun
  }

  // Transformations to try (in order)
  const transformations: ((name: string) => string)[] = [
    // Remove "City Of " prefix
    (name) => name.replace(/^City Of /i, ''),
    // Remove suffixes
    (name) => name.replace(/ City Capital$/i, ''),
    (name) => name.replace(/ Capital$/i, ''),
    (name) => name.replace(/ \(Capital\)$/i, ''),
    (name) => name.replace(/ City$/i, ''),
    // Combine: remove prefix and suffix
    (name) => name.replace(/^City Of /i, '').replace(/ Capital$/i, ''),
    (name) => name.replace(/^City Of /i, '').replace(/ City$/i, ''),
  ]

  // Try each transformation
  for (const transform of transformations) {
    const normalized = transform(citymun)
    if (normalized !== citymun) {
      // Try exact match
      if (municipalityNames.has(normalized)) {
        return normalized
      }
      // Try case-insensitive match
      for (const name of municipalityNames) {
        if (name.toLowerCase() === normalized.toLowerCase()) {
          return name
        }
      }
    }
  }

  // Try just case-insensitive match on original
  const citymunLower = citymun.toLowerCase()
  for (const name of municipalityNames) {
    if (name.toLowerCase() === citymunLower) {
      return name
    }
  }

  // Return original if no match found (will be stored as-is)
  return citymun
}

async function seed() {
  console.log('Fetching PSGC data from GitHub repository...\n')

  // Fetch all data
  console.log('Fetching regions...')
  const regions = await fetchJSON<Region[]>(`${GITHUB_RAW_BASE}/regions.json`)
  console.log(`  Found ${regions.length} regions`)

  console.log('Fetching provinces...')
  const provinces = await fetchJSON<Province[]>(`${GITHUB_RAW_BASE}/provinces.json`)
  console.log(`  Found ${provinces.length} provinces`)

  console.log('Fetching municipalities/cities...')
  const municipalities = await fetchJSON<Municipality[]>(`${GITHUB_RAW_BASE}/municipalities.json`)
  console.log(`  Found ${municipalities.length} cities/municipalities`)

  console.log('Fetching barangays...')
  const barangays = await fetchJSON<Barangay[]>(`${GITHUB_RAW_BASE}/barangays.json`)
  console.log(`  Found ${barangays.length} barangays\n`)

  // Build lookup structures
  const municipalityNames = new Set(municipalities.map(m => m.name))

  // Map: cityMunName -> provinceName (for cities with unique names)
  // Map: cityMunName -> Map<provinceCode, provinceName> (for disambiguation)
  const cityMunToProvince = new Map<string, string>()
  const cityMunToProvinces = new Map<string, string[]>() // For cities that exist in multiple provinces

  for (const m of municipalities) {
    const existing = cityMunToProvinces.get(m.name)
    if (existing) {
      existing.push(m.province)
    } else {
      cityMunToProvinces.set(m.name, [m.province])
    }
  }

  // For unique city names, store direct mapping
  for (const [cityName, provinceList] of cityMunToProvinces) {
    if (provinceList.length === 1) {
      cityMunToProvince.set(cityName, provinceList[0])
    }
  }

  // Build province code mapping by analyzing barangay codes
  // Barangay code structure: RRPPCCBBB (RR=region, PP=province, CC=citymun, BBB=barangay)
  // First 4 digits = province identifier
  const provinceCodeToCityMuns = new Map<string, Set<string>>()

  for (const b of barangays) {
    const codeStr = String(b.code)
    const provinceCode = codeStr.substring(0, 4)
    const normalizedCityMun = normalizeCityMunName(b.citymun, municipalityNames)

    if (!provinceCodeToCityMuns.has(provinceCode)) {
      provinceCodeToCityMuns.set(provinceCode, new Set())
    }
    provinceCodeToCityMuns.get(provinceCode)!.add(normalizedCityMun)
  }

  // Now figure out which province each code belongs to
  // by finding municipalities that exist in that code's city set
  const provinceCodeToName = new Map<string, string>()

  for (const [code, cityMunSet] of provinceCodeToCityMuns) {
    // Find a municipality from this set that we can use to identify the province
    for (const cityMunName of cityMunSet) {
      const provinces = cityMunToProvinces.get(cityMunName)
      if (provinces && provinces.length === 1) {
        // This city/mun name is unique, so we know the province
        provinceCodeToName.set(code, provinces[0])
        break
      }
    }
  }

  // For codes we couldn't determine, try harder by looking at multiple cities
  for (const [code, cityMunSet] of provinceCodeToCityMuns) {
    if (provinceCodeToName.has(code)) continue

    // Count which province appears most for cities in this code
    const provinceCounts = new Map<string, number>()
    for (const cityMunName of cityMunSet) {
      const provinces = cityMunToProvinces.get(cityMunName)
      if (provinces) {
        for (const p of provinces) {
          provinceCounts.set(p, (provinceCounts.get(p) || 0) + 1)
        }
      }
    }

    // Pick the province with the most matches
    let maxCount = 0
    let bestProvince = ''
    for (const [province, count] of provinceCounts) {
      if (count > maxCount) {
        maxCount = count
        bestProvince = province
      }
    }

    if (bestProvince) {
      provinceCodeToName.set(code, bestProvince)
    }
  }

  console.log(`  Mapped ${provinceCodeToName.size} province codes to names`)

  // Insert regions
  console.log('Inserting regions...')
  const regionValues = regions.map(r => ({
    name: r.name,
    designation: r.designation,
  }))
  await db.insert(psgcRegions).values(regionValues).onConflictDoNothing()
  console.log(`  Inserted ${regionValues.length} regions`)

  // Insert provinces
  console.log('Inserting provinces...')
  const provinceValues = provinces.map(p => ({
    name: p.name,
    regionName: p.region,
  }))
  await db.insert(psgcProvinces).values(provinceValues).onConflictDoNothing()
  console.log(`  Inserted ${provinceValues.length} provinces`)

  // Insert cities/municipalities
  console.log('Inserting cities/municipalities...')
  const cityMunValues = municipalities.map(m => ({
    name: m.name,
    provinceName: m.province,
    isCity: m.city,
  }))
  await db.insert(psgcCitiesMunicipalities).values(cityMunValues).onConflictDoNothing()
  console.log(`  Inserted ${cityMunValues.length} cities/municipalities`)

  // Insert barangays in batches with province lookup
  console.log('Inserting barangays (this may take a while)...')
  const BATCH_SIZE = 5000
  let inserted = 0
  let unmatchedCount = 0

  for (let i = 0; i < barangays.length; i += BATCH_SIZE) {
    const batch = barangays.slice(i, i + BATCH_SIZE)
    const barangayValues = batch.map(b => {
      const codeStr = String(b.code)
      const normalizedCityMun = normalizeCityMunName(b.citymun, municipalityNames)
      const provinceCode = codeStr.substring(0, 4)

      // Get province from code mapping, or fallback to direct city lookup
      let provinceName = provinceCodeToName.get(provinceCode)
      if (!provinceName) {
        provinceName = cityMunToProvince.get(normalizedCityMun) || 'Unknown'
        if (provinceName === 'Unknown') {
          unmatchedCount++
        }
      }

      return {
        code: codeStr,
        name: b.name,
        cityMunName: normalizedCityMun,
        provinceName: provinceName,
      }
    })
    await db.insert(psgcBarangays).values(barangayValues).onConflictDoNothing()
    inserted += batch.length
    console.log(`  Inserted ${inserted}/${barangays.length} barangays...`)
  }

  if (unmatchedCount > 0) {
    console.log(`\nWarning: ${unmatchedCount} barangays could not be matched to a province`)
  }

  console.log('\nPSGC data seeded successfully!')
  await client.end()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Error seeding PSGC data:', err)
  process.exit(1)
})
