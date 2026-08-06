import { db } from './client'
import {
  terminals, levels, washroomUnits, washroomState,
  maintenanceIssues, incidents, incidentTimeline, whiHistory
} from './schema'

// Deterministic Pseudo-Random Generator
function createRandom(seed = 12345) {
  let s = seed
  return function() {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}
const nextRand = createRandom(42)

function randRange(min: number, max: number) {
  return min + nextRand() * (max - min)
}

function randElement<T>(arr: T[]): T {
  return arr[Math.floor(nextRand() * arr.length)]
}

// local computeWHI to avoid ts-node import complications
function localComputeWHI(params: {
  cleanliness_score: number
  occupancy_count: number
  unit_type: 'PPM' | 'PPF' | 'PPD'
  soap_pct: number
  paper_pct: number
  sanitizer_pct: number
  ammonia_ppm: number
}): number {
  const CAPACITY = { PPM: 4, PPF: 4, PPD: 2 }
  const capacity = CAPACITY[params.unit_type]
  const occupancyLoadPct = Math.min((params.occupancy_count / capacity) * 100, 100)
  const supplyScore = (params.soap_pct + params.paper_pct + params.sanitizer_pct) / 3
  const airScore = Math.max(0, 100 - Math.min((params.ammonia_ppm / 50) * 100, 100))
  return Math.round((
    params.cleanliness_score * 0.35 +
    (100 - occupancyLoadPct) * 0.20 +
    supplyScore * 0.25 +
    airScore * 0.20
  ) * 10) / 10
}

// 54 Device Schema - 3 Terminals only (NO CGO)
const TERMINALS = [
  { id: 'T1',  name: 'Old Domestic Terminal',          code: 'T1',  type: 'domestic',      total_levels: 6 },
  { id: 'T2',  name: 'New International Terminal',     code: 'T2',  type: 'international', total_levels: 6 },
  { id: 'T3',  name: 'Terminal 3',                     code: 'T3',  type: 'domestic',      total_levels: 6 },
]

const LEVEL_LABELS: Record<string, Record<number, string>> = {
  T1: {
    1: 'Level 1 — Ground / Arrivals',
    2: 'Level 2 — Baggage & Immigration',
    3: 'Level 3 — Departures Check-in',
    4: 'Level 4 — Security & Gates',
    5: 'Level 5 — Retail & F&B',
    6: 'Level 6 — Rooftop / Utilities',
  },
  T2: {
    1: 'Level 1 — Ground / Arrivals Hall',
    2: 'Level 2 — Immigration & Customs',
    3: 'Level 3 — Departures & Check-in',
    4: 'Level 4 — International Security',
    5: 'Level 5 — Airside Retail & Lounges',
    6: 'Level 6 — Administrative & Utilities',
  },
  T3: {
    1: 'Level 1 — Ground / Arrivals',
    2: 'Level 2 — Baggage & Check-in',
    3: 'Level 3 — Departures & Security',
    4: 'Level 4 — Gates & Boarding',
    5: 'Level 5 — Retail & Dining',
    6: 'Level 6 — Maintenance & Utilities',
  },
}

// 54 Device IDs - 3 per level (PPD, PPM, PPF) × 6 levels × 3 terminals = 54
const DEVICE_IDS = [
  // Terminal 1 (T1)
  "T1-L1-PPD-001", "T1-L1-PPM-002", "T1-L1-PPF-003",
  "T1-L2-PPD-004", "T1-L2-PPM-005", "T1-L2-PPF-006",
  "T1-L3-PPD-007", "T1-L3-PPM-008", "T1-L3-PPF-009",
  "T1-L4-PPD-010", "T1-L4-PPM-011", "T1-L4-PPF-012",
  "T1-L5-PPD-013", "T1-L5-PPM-014", "T1-L5-PPF-015",
  "T1-L6-PPD-016", "T1-L6-PPM-017", "T1-L6-PPF-018",
  // Terminal 2 (T2)
  "T2-L1-PPD-019", "T2-L1-PPM-020", "T2-L1-PPF-021",
  "T2-L2-PPD-022", "T2-L2-PPM-023", "T2-L2-PPF-024",
  "T2-L3-PPD-025", "T2-L3-PPM-026", "T2-L3-PPF-027",
  "T2-L4-PPD-028", "T2-L4-PPM-029", "T2-L4-PPF-030",
  "T2-L5-PPD-031", "T2-L5-PPM-032", "T2-L5-PPF-033",
  "T2-L6-PPD-034", "T2-L6-PPM-035", "T2-L6-PPF-036",
  // Terminal 3 (T3)
  "T3-L1-PPD-037", "T3-L1-PPM-038", "T3-L1-PPF-039",
  "T3-L2-PPD-040", "T3-L2-PPM-041", "T3-L2-PPF-042",
  "T3-L3-PPD-043", "T3-L3-PPM-044", "T3-L3-PPF-045",
  "T3-L4-PPD-046", "T3-L4-PPM-047", "T3-L4-PPF-048",
  "T3-L5-PPD-049", "T3-L5-PPM-050", "T3-L5-PPF-051",
  "T3-L6-PPD-052", "T3-L6-PPM-053", "T3-L6-PPF-054",
]

// Unit type capacities
const UNIT_CAPACITY: Record<string, number> = {
  PPD: 2,  // Disabled
  PPM: 4,  // Men
  PPF: 4,  // Female
}

async function main() {
  console.log('Clearing database...')
  await db.delete(whiHistory)
  await db.delete(incidentTimeline)
  await db.delete(incidents)
  await db.delete(maintenanceIssues)
  await db.delete(washroomState)
  await db.delete(washroomUnits)
  await db.delete(levels)
  await db.delete(terminals)

  console.log('Seeding 3 terminals (T1, T2, T3)...')
  await db.insert(terminals).values(TERMINALS)

  console.log('Seeding levels...')
  const levelsMapping: Record<string, Record<number, number>> = {}
  for (const t of TERMINALS) {
    levelsMapping[t.id] = {}
    for (let l = 1; l <= 6; l++) {
      const label = LEVEL_LABELS[t.id][l] || `Level ${l}`
      const [insertedLevel] = await db.insert(levels).values({
        terminal_id: t.id,
        level_number: l,
        label,
        is_active: true
      }).returning()
      levelsMapping[t.id][l] = insertedLevel.id
    }
  }

  console.log('Generating 54 washroom units and states...')
  const allUnits: typeof washroomUnits.$inferInsert[] = []
  const allStates: typeof washroomState.$inferInsert[] = []

  for (const deviceId of DEVICE_IDS) {
    // Parse device ID: Tn-Lm-PPX-NNN
    const parts = deviceId.split('-')
    const terminalId = parts[0]
    const levelNum = parseInt(parts[1].replace('L', ''))
    const unitType = parts[2] as 'PPD' | 'PPM' | 'PPF'
    const unitNumber = parseInt(parts[3])

    const levelId = levelsMapping[terminalId]?.[levelNum]
    if (!levelId) continue

    const capacity = UNIT_CAPACITY[unitType]
    const typeLabel = unitType === 'PPM' ? 'Male' : unitType === 'PPF' ? 'Female' : 'Disabled'
    const label = `${terminalId} · L${levelNum} · ${typeLabel} · Unit ${String(unitNumber).padStart(2, '0')}`

    allUnits.push({
      device_id: deviceId,
      terminal_id: terminalId,
      level_id: levelId,
      unit_type: unitType,
      unit_number: unitNumber,
      label,
      capacity,
      location_desc: `Near Gate ${10 + unitNumber}, Level ${levelNum}`,
      is_active: true
    })

    // Generate state with varying WHI between 60-85
    const occupancyStatus: 'VACANT' | 'OCCUPIED' | 'CLEANING' | 'OUT_OF_ORDER' = 'VACANT'
    const occupancyCount = 0

    const cleanlinessScore = Math.round(randRange(60, 90))
    const soapPct = Math.round(randRange(70, 100))
    const paperPct = Math.round(randRange(70, 100))
    const sanitizerPct = Math.round(randRange(70, 100))
    const ammoniaPpm = randRange(2, 20)
    const co2Ppm = randRange(400, 800)
    const humidityPct = randRange(45, 65)
    const tempCelsius = randRange(22, 27)
    const batteryLevel = randRange(60, 100)
    const signalStrength = randRange(-70, -45)

    const whiScore = localComputeWHI({
      cleanliness_score: cleanlinessScore,
      occupancy_count: occupancyCount,
      unit_type: unitType,
      soap_pct: soapPct,
      paper_pct: paperPct,
      sanitizer_pct: sanitizerPct,
      ammonia_ppm: ammoniaPpm
    })

    const now = new Date()
    allStates.push({
      device_id: deviceId,
      updated_at: now,
      occupancy_status: occupancyStatus,
      occupancy_count: occupancyCount,
      door_status: 'OPEN',
      cleanliness_score: cleanlinessScore,
      soap_pct: soapPct,
      paper_pct: paperPct,
      sanitizer_pct: sanitizerPct,
      ammonia_ppm: ammoniaPpm,
      co2_ppm: co2Ppm,
      humidity_pct: humidityPct,
      temp_celsius: tempCelsius,
      battery_level: batteryLevel,
      signal_strength: signalStrength,
      whi_score: whiScore,
      last_cleaned_at: new Date(now.getTime() - Math.floor(randRange(10, 480)) * 60000),
      last_inspected_at: new Date(now.getTime() - Math.floor(randRange(30, 1440)) * 60000),
    })
  }

  console.log('Inserting 54 washroom units...')
  await db.insert(washroomUnits).values(allUnits)

  console.log('Inserting 54 washroom states...')
  await db.insert(washroomState).values(allStates)

  console.log('Seeding maintenance issues...')
  const issuesToSeed: typeof maintenanceIssues.$inferInsert[] = []
  for (let i = 0; i < 20; i++) {
    const randomUnit = randElement(allUnits)
    issuesToSeed.push({
      device_id: randomUnit.device_id,
      issue_text: randElement(['Ammonia levels high', 'Soap dispenser low', 'Paper towels depleted', 'Exhaust fan noise', 'Water pressure low']),
      is_resolved: false
    })
  }
  await db.insert(maintenanceIssues).values(issuesToSeed)

  console.log('Seeding active incidents and timeline logs...')
  const titles = [
    { title: 'Excessive Ammonia Odour Detected', type: 'Odour', severity: 'CRITICAL' },
    { title: 'Water Leakage Near Basin', type: 'Overflow', severity: 'HIGH' },
    { title: 'Soap Supplies Depleted', type: 'Out of Supplies', severity: 'MEDIUM' },
    { title: 'Door Lock Mechanism Malfunction', type: 'Broken Fixture', severity: 'LOW' }
  ]
  const staff = ['Arpit Sharma', 'S. K. Gupta', 'Pranab Roy', 'K. K. Sen']

  for (let i = 1; i <= 8; i++) {
    const randomUnit = randElement(allUnits)
    const t = randElement(titles)
    const ref = `INC-2026-${String(i).padStart(5, '0')}`

    const [insertedIncident] = await db.insert(incidents).values({
      incident_ref: ref,
      device_id: randomUnit.device_id,
      terminal_id: randomUnit.terminal_id,
      level_id: randomUnit.level_id,
      title: t.title,
      description: 'Diagnostic registers show abnormal parameters. Action required.',
      issue_type: t.type,
      severity: t.severity,
      status: i % 3 === 0 ? 'RESOLVED' : i % 2 === 0 ? 'IN_PROGRESS' : 'OPEN',
      reported_by: 'System Sentinel',
      assigned_to: randElement(staff),
      created_at: new Date(Date.now() - 3600000 * i),
      updated_at: new Date(),
      resolved_at: i % 3 === 0 ? new Date() : null
    }).returning()

    await db.insert(incidentTimeline).values([
      {
        incident_id: insertedIncident.id,
        actor: 'System Sentinel',
        action: 'Reported',
        note: 'Incident automatically opened by diagnostics monitor.',
        happened_at: insertedIncident.created_at
      }
    ])
  }

  console.log('Seeding 7-day WHI history rollups...')
  const allHistory: typeof whiHistory.$inferInsert[] = []
  const today = new Date()

  // Seed historical data for all 54 units
  for (const u of allUnits) {
    const stateObj = allStates.find(x => x.device_id === u.device_id)
    const baseWhi = stateObj ? stateObj.whi_score : 75
    for (let d = 1; d <= 7; d++) {
      const dateStr = new Date(today.getTime() - d * 24 * 3600 * 1000).toISOString().split('T')[0]
      allHistory.push({
        device_id: u.device_id,
        date: dateStr,
        avg_whi: Math.min(100, Math.max(40, Math.round(baseWhi + randRange(-10, 10)))),
        min_whi: Math.min(100, Math.max(20, Math.round(baseWhi - randRange(10, 20)))),
        max_whi: Math.min(100, Math.max(50, Math.round(baseWhi + randRange(5, 15)))),
        total_occupancy_count: Math.floor(randRange(10, 60))
      })
    }
  }

  console.log('Inserting WHI history chunks...')
  for (let i = 0; i < allHistory.length; i += 500) {
    await db.insert(whiHistory).values(allHistory.slice(i, i + 500))
  }

  console.log('Seeding finished successfully!')
  console.log(`Seeded ${allUnits.length} washroom units (54 devices)`)
}

main().catch(err => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
