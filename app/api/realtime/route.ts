import { NextRequest } from 'next/server'
import WebSocket from 'ws'
import * as satellite from 'satellite.js'

export const runtime = 'nodejs'

type RealtimeEvent = {
  id: string
  longitude: number
  latitude: number
  title: string
  description: string
  severity: 'low' | 'medium' | 'high'
  satellite?: string | null
  origin?: string | null
  callsign?: string | null
  altitude?: number | null
  velocity?: number | null
  heading?: number | null
  shipMmsi?: string | null
  shipName?: string | null
}

type RealtimePayload = RealtimeEvent | RealtimeEvent[]

type EonetEvent = {
  id: string
  title: string
  categories?: Array<{ title: string }>
  geometry?: Array<{ type: string; coordinates: any }>
}

type OpenAQResult = {
  location?: string
  coordinates?: { latitude?: number; longitude?: number }
  measurements?: Array<{ parameter?: string; value?: number; unit?: string }>
}

const eventFetchInterval = 1000
const rateLimitBackoff = 90_000
const sourceRateLimitStatus = new Map<string, number>()
const eventQueue: RealtimePayload[] = []
const maxQueuedPayloads = 300

let lastFlightStates: any[] = []
let producersStarted = false
const producerTimers: ReturnType<typeof setInterval>[] = []

// EMSC real-time earthquake WebSocket (no API key required)
let emscWs: WebSocket | null = null

function connectEmscWebSocket() {
  if (emscWs && (emscWs.readyState === WebSocket.OPEN || emscWs.readyState === WebSocket.CONNECTING)) return
  try {
    emscWs = new WebSocket('wss://www.seismicportal.eu/standing_order/websocket')
  } catch {
    setTimeout(connectEmscWebSocket, 10_000)
    return
  }

  emscWs.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as any
      if (msg.action !== 'create' && msg.action !== 'update') return
      const props = msg.data?.properties
      const coords = msg.data?.geometry?.coordinates
      if (!props || !Array.isArray(coords) || coords.length < 2) return
      const lon = coords[0]
      const lat = coords[1]
      if (!isNumber(lon) || !isNumber(lat)) return
      const mag = Number(props.mag ?? 0)
      const place = String(props.flynn_region ?? props.region ?? 'Unknown region')
      const [longitude, latitude] = normalizeCoordinates(lon, lat)
      const severity: 'low' | 'medium' | 'high' = mag >= 5 ? 'high' : mag >= 3 ? 'medium' : 'low'
      const seismicEvent: RealtimeEvent = {
        id: `emsc-${String(props.unid ?? Date.now())}-${Date.now()}`,
        title: 'Global seismic event',
        description: `M${mag.toFixed(1)} earthquake \u2014 ${place}`,
        severity,
        latitude,
        longitude,
        satellite: null,
        origin: 'EMSC Real-time Seismology',
        callsign: null,
        altitude: null,
        velocity: null,
        heading: null,
      }
      enqueueOutput(seismicEvent)
    } catch { /* ignore malformed messages */ }
  })

  emscWs.on('close', () => {
    emscWs = null
    setTimeout(connectEmscWebSocket, 5_000)
  })

  emscWs.on('error', () => {
    emscWs?.terminate()
    emscWs = null
  })
}

const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all?lamin=-90&lomin=-180&lamax=90&lomax=180'
const CELESTRAK_ACTIVE_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'
const AISHUB_USERNAME = process.env.AISHUB_USERNAME?.trim() ?? ''

const isNumber = (value: any): value is number => typeof value === 'number' && Number.isFinite(value)
const clampLatitude = (value: number) => Math.max(-90, Math.min(90, value))
const wrapLongitude = (value: number) => ((value + 180) % 360 + 360) % 360 - 180

const normalizeCoordinates = (longitude: number, latitude: number): [number, number] => [
  wrapLongitude(longitude),
  clampLatitude(latitude),
]

const enqueuePayload = (payload: RealtimePayload) => {
  eventQueue.push(payload)
  if (eventQueue.length > maxQueuedPayloads) {
    eventQueue.shift()
  }
}

const enqueueOutput = (output: RealtimePayload) => {
  if (Array.isArray(output)) {
    const chunkSize = 500
    for (let i = 0; i < output.length; i += chunkSize) {
      enqueuePayload(output.slice(i, i + chunkSize))
    }
    return
  }

  enqueuePayload(output)
}

const isSourceRateLimited = (source: string) => Date.now() < (sourceRateLimitStatus.get(source) ?? 0)
const markSourceRateLimited = (source: string) => {
  sourceRateLimitStatus.set(source, Date.now() + rateLimitBackoff)
}

const handlePotentialRateLimit = (response: Response, source: string) => {
  if (response.status === 429 || response.status === 503) {
    markSourceRateLimited(source)
    throw new Error(`${source} rate limited: ${response.status}`)
  }
}

const normalizeEonetCoordinates = (geometry: any): [number, number] | null => {
  if (!geometry?.coordinates) return null

  const coords = geometry.coordinates

  if (Array.isArray(coords)) {
    if (coords.length >= 2 && isNumber(coords[0]) && isNumber(coords[1])) {
      return normalizeCoordinates(coords[0], coords[1])
    }

    if (Array.isArray(coords[0])) {
      const flat = coords.flat(Infinity).filter(isNumber)
      if (flat.length >= 2) return normalizeCoordinates(flat[0], flat[1])
    }
  }

  return null
}

const getFlightField = (state: any, index: number, key: string) =>
  Array.isArray(state) ? state[index] : state?.[key]

const normalizeAisHubShipState = (ship: any) => ({
  mmsi: String(ship.MMSI ?? ''),
  name: String(ship.NAME ?? ship.CALLSIGN ?? 'Unknown vessel'),
  callsign: String(ship.CALLSIGN ?? '').trim() || null,
  longitude: Number(ship.LONGITUDE),
  latitude: Number(ship.LATITUDE),
  heading:
    isNumber(Number(ship.HEADING)) && Number(ship.HEADING) >= 0 && Number(ship.HEADING) <= 360 && Number(ship.HEADING) !== 511
      ? Number(ship.HEADING)
      : null,
  speedKnots: isNumber(Number(ship.SOG)) ? Number(ship.SOG) : null,
  destination: String(ship.DEST ?? '').trim() || null,
})

async function fetchIssEvent(): Promise<RealtimeEvent> {
  const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544')
  handlePotentialRateLimit(response, 'iss')
  if (!response.ok) {
    throw new Error('Failed to fetch ISS position')
  }

  const data = await response.json()
  const [longitude, latitude] = normalizeCoordinates(data.longitude, data.latitude)

  return {
    id: `iss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Orbital observation pass',
    description: `ISS current position at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    severity: 'high',
    latitude,
    longitude,
    satellite: data.name ?? 'International Space Station',
    origin: 'International Space Station',
    callsign: null,
    altitude: null,
    velocity: null,
    shipMmsi: null,
    shipName: null,
  }
}

async function fetchEarthquakeEvent(): Promise<RealtimeEvent> {
  const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson')
  handlePotentialRateLimit(response, 'usgs')
  if (!response.ok) {
    throw new Error('Failed to fetch earthquake data')
  }

  const data = await response.json()
  const features = (data.features ?? []).filter(
    (feature: any) =>
      feature?.geometry?.coordinates?.length >= 2 &&
      isNumber(feature.geometry.coordinates[0]) &&
      isNumber(feature.geometry.coordinates[1]),
  )

  if (!features.length) {
    throw new Error('No valid earthquake events available')
  }

  const feature = features[Math.floor(Math.random() * features.length)]
  const [longitude, latitude] = normalizeCoordinates(feature.geometry.coordinates[0], feature.geometry.coordinates[1])
  const magnitude = feature.properties?.mag ?? 0
  const place = feature.properties?.place ?? 'an unknown location'
  const severity = magnitude >= 5 ? 'high' : magnitude >= 3 ? 'medium' : 'low'

  return {
    id: `usgs-${feature.id ?? Date.now()}-${Date.now()}`,
    title: 'Global seismic event',
    description: `M${magnitude.toFixed(1)} earthquake near ${place}`,
    severity,
    latitude,
    longitude,
    satellite: null,
    origin: 'USGS Global Earthquake Feed',
    callsign: null,
    altitude: null,
    velocity: null,
    shipMmsi: null,
    shipName: null,
  }
}

async function fetchEonetEvent(): Promise<RealtimeEvent> {
  const response = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50')
  handlePotentialRateLimit(response, 'eonet')
  if (!response.ok) {
    throw new Error('Failed to fetch NASA EONET event data')
  }

  const data = await response.json()
  const events = (data.events ?? []).filter((event: EonetEvent) => {
    const geometry = event.geometry?.[event.geometry.length - 1]
    return normalizeEonetCoordinates(geometry) !== null
  })
  if (!events.length) {
    throw new Error('No valid EONET events available')
  }

  const event = events[Math.floor(Math.random() * events.length)]
  const category = event.categories?.[0]?.title ?? 'Natural event'
  const geometry = event.geometry?.[event.geometry.length - 1]
  const coords = normalizeEonetCoordinates(geometry)
  if (!coords) {
    throw new Error('EONET event missing valid geometry')
  }

  const [longitude, latitude] = coords
  const severity = category.toLowerCase().includes('volcano')
    ? 'high'
    : category.toLowerCase().includes('storm')
    ? 'medium'
    : 'low'

  return {
    id: `eonet-${event.id ?? Date.now()}-${Date.now()}`,
    title: `${category} event`,
    description: `${event.title} (${category})`,
    severity,
    latitude,
    longitude,
    satellite: null,
    origin: 'NASA EONET',
    callsign: null,
    altitude: null,
    velocity: null,
    shipMmsi: null,
    shipName: null,
  }
}

async function fetchAirQualityEvent(): Promise<RealtimeEvent> {
  const response = await fetch('https://api.openaq.org/v2/latest?limit=100&page=1&offset=0&sort=desc')
  handlePotentialRateLimit(response, 'openaq')
  if (!response.ok) {
    throw new Error('Failed to fetch air quality data')
  }

  const data = await response.json()
  const results = (data.results ?? []).filter(
    (result: OpenAQResult) =>
      result?.coordinates &&
      isNumber(result.coordinates.latitude) &&
      isNumber(result.coordinates.longitude),
  )
  if (!results.length) {
    throw new Error('No valid air quality data available')
  }

  const result = results[Math.floor(Math.random() * results.length)]
  const location = result.location ?? 'Unknown location'
  const coords = result.coordinates ?? { latitude: 0, longitude: 0 }
  const measurement = (result.measurements ?? [])[0]
  const parameter = measurement?.parameter ?? 'pm2.5'
  const value = measurement?.value ?? 0
  const unit = measurement?.unit ?? 'ug/m3'
  const [longitude, latitude] = normalizeCoordinates(coords.longitude ?? 0, coords.latitude ?? 0)

  return {
    id: `aq-${result.location ?? 'unknown'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Air quality observation',
    description: `${parameter.toUpperCase()} ${value} ${unit} at ${location}`,
    severity: 'low',
    latitude,
    longitude,
    satellite: null,
    origin: 'OpenAQ Global Air Quality',
    callsign: null,
    altitude: null,
    velocity: null,
    shipMmsi: null,
    shipName: null,
  }
}

async function fetchOpenSkyFlightStates() {
  if (isSourceRateLimited('opensky') && lastFlightStates.length) {
    return lastFlightStates
  }

  if (isSourceRateLimited('opensky')) {
    throw new Error('OpenSky currently rate limited')
  }

  const response = await fetch(OPEN_SKY_URL, {
    headers: {
      'User-Agent': 'Worldview/1.0',
      Accept: 'application/json',
    },
  })

  handlePotentialRateLimit(response, 'opensky')

  if (!response.ok) {
    throw new Error(`OpenSky fetch failed: ${response.status}`)
  }

  const data = await response.json()
  return (data.states ?? []).filter(
    (state: any) => getFlightField(state, 5, 'longitude') !== null && getFlightField(state, 6, 'latitude') !== null,
  )
}

async function fetchAllFlightEvents(): Promise<RealtimeEvent[]> {
  let states: any[] = []

  if (!isSourceRateLimited('opensky')) {
    try {
      const openSkyStates = await fetchOpenSkyFlightStates()
      if (openSkyStates.length) {
        states = openSkyStates
      }
    } catch {
      // ignore and fall back to cached data
    }
  }

  if (!states.length && lastFlightStates.length) {
    states = lastFlightStates
  }

  if (!states.length) {
    throw new Error('No live OpenSky flight data available')
  }

  lastFlightStates = states
  const events = states
    .map((state: any, index: number): RealtimeEvent | null => {
      const heading: number | null = getFlightField(state, 10, 'heading') ?? state.heading ?? null
      const callsign = getFlightField(state, 1, 'callsign')?.trim?.() || getFlightField(state, 0, 'icao24') || 'UNKNOWN'
      const originCountry = getFlightField(state, 2, 'originCountry') || getFlightField(state, 1, 'originCountry') || 'Unknown'
      const altitude =
        getFlightField(state, 13, 'altitude') ??
        getFlightField(state, 7, 'altitude') ??
        getFlightField(state, 5, 'altitude') ??
        null
      const velocity = getFlightField(state, 9, 'velocity') ?? getFlightField(state, 6, 'velocity') ?? null
      const latitude = getFlightField(state, 6, 'latitude') ?? getFlightField(state, 3, 'latitude') ?? state.latitude
      const longitude = getFlightField(state, 5, 'longitude') ?? getFlightField(state, 2, 'longitude') ?? state.longitude

      if (latitude == null || longitude == null) {
        return null
      }

      const [safeLongitude, safeLatitude] = normalizeCoordinates(longitude, latitude)
      const icao24 = getFlightField(state, 0, 'icao24') ?? `idx-${index}`

      return {
        id: `flight-${icao24}`,
        title: 'Air traffic track',
        description: `Flight ${callsign} from ${originCountry}`,
        severity: 'medium',
        latitude: safeLatitude,
        longitude: safeLongitude,
        satellite: null,
        origin: originCountry,
        callsign,
        altitude,
        velocity,
        heading,
        shipMmsi: null,
        shipName: null,
      }
    })
    .filter((event): event is RealtimeEvent => event !== null)

  if (!events.length) {
    throw new Error('No valid flight states available')
  }

  return events
}

async function fetchShipStatesFromAisHub() {
  if (!AISHUB_USERNAME) {
    throw new Error('AISHub username not configured')
  }

  if (isSourceRateLimited('aishub')) {
    throw new Error('AISHub currently rate limited')
  }

  const url = `https://data.aishub.net/ws.php?username=${encodeURIComponent(AISHUB_USERNAME)}&format=1&output=json&compress=0&latmin=-90&latmax=90&lonmin=-180&lonmax=180&interval=5`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Worldview/1.0',
      Accept: 'application/json',
    },
  })

  handlePotentialRateLimit(response, 'aishub')

  if (!response.ok) {
    throw new Error(`AISHub fetch failed: ${response.status}`)
  }

  const data = await response.json()
  const vessels = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.vessels) ? data.vessels : []

  return vessels
    .map(normalizeAisHubShipState)
    .filter((v: any) => v.mmsi && isNumber(v.latitude) && isNumber(v.longitude))
}

async function fetchShipEvent(): Promise<RealtimeEvent> {
  const vessels = await fetchShipStatesFromAisHub()
  if (!vessels.length) {
    throw new Error('No live ship data available')
  }

  const vessel = vessels[Math.floor(Math.random() * vessels.length)]
  const [longitude, latitude] = normalizeCoordinates(vessel.longitude, vessel.latitude)
  const speedMs = isNumber(vessel.speedKnots) ? vessel.speedKnots * 0.514444 : null
  const heading = isNumber(vessel.heading) ? vessel.heading : null

  return {
    id: `ship-${vessel.mmsi}-${Date.now()}`,
    title: 'Maritime vessel track',
    description: `${vessel.name}${vessel.destination ? ` bound for ${vessel.destination}` : ''}`,
    severity: 'low',
    latitude,
    longitude,
    satellite: null,
    origin: 'AISHub AIS Network',
    callsign: null,
    altitude: null,
    velocity: speedMs,
    heading,
    shipMmsi: vessel.mmsi,
    shipName: vessel.name,
  }
}

function buildSatelliteEventsFromTle(tleText: string, at: Date): RealtimeEvent[] {
  const lines = tleText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const events: RealtimeEvent[] = []
  const gmst = satellite.gstime(at)

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i]
    const line1 = lines[i + 1]
    const line2 = lines[i + 2]
    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue

    try {
      const satrec = satellite.twoline2satrec(line1, line2)
      const pv = satellite.propagate(satrec, at)
      if (!pv.position) continue

      const gd = satellite.eciToGeodetic(pv.position, gmst)
      const latitude = satellite.degreesLat(gd.latitude)
      const longitude = satellite.degreesLong(gd.longitude)
      const altitude = Number.isFinite(gd.height) ? gd.height * 1000 : null

      let velocity: number | null = null
      if (pv.velocity) {
        const speedKmS = Math.sqrt(
          pv.velocity.x * pv.velocity.x +
            pv.velocity.y * pv.velocity.y +
            pv.velocity.z * pv.velocity.z,
        )
        velocity = Number.isFinite(speedKmS) ? speedKmS * 1000 : null
      }

      const [safeLongitude, safeLatitude] = normalizeCoordinates(longitude, latitude)
      events.push({
        id: `sat-${satrec.satnum}`,
        title: 'Satellite orbit track',
        description: `${name} orbital pass`,
        severity: 'low',
        latitude: safeLatitude,
        longitude: safeLongitude,
        satellite: name,
        origin: 'CelesTrak TLE',
        callsign: null,
        altitude,
        velocity,
        heading: null,
        shipMmsi: null,
        shipName: null,
      })
    } catch {
      // skip malformed record
    }
  }

  return events
}

async function fetchAllSatelliteEvents(): Promise<RealtimeEvent[]> {
  if (isSourceRateLimited('celestrak')) {
    throw new Error('CelesTrak currently rate limited')
  }

  const response = await fetch(CELESTRAK_ACTIVE_TLE_URL, {
    headers: {
      'User-Agent': 'Worldview/1.0',
      Accept: 'text/plain',
    },
  })

  handlePotentialRateLimit(response, 'celestrak')
  if (!response.ok) {
    throw new Error(`CelesTrak fetch failed: ${response.status}`)
  }

  const tleText = await response.text()
  const events = buildSatelliteEventsFromTle(tleText, new Date())
  if (!events.length) {
    throw new Error('No valid satellite events available')
  }

  // Keep throughput manageable while still representing global satellite activity.
  return events.slice(0, 250)
}

const startPollingSource = (
  sourceName: string,
  intervalMs: number,
  producer: () => Promise<RealtimePayload>,
) => {
  const tick = async () => {
    if (isSourceRateLimited(sourceName)) {
      return
    }

    try {
      const payload = await producer()
      enqueueOutput(payload)
    } catch {
      // source temporarily unavailable; next tick will retry
    }
  }

  void tick()
  const timer = setInterval(() => {
    void tick()
  }, intervalMs)
  producerTimers.push(timer)
}

const startSharedProducers = () => {
  if (producersStarted) return
  producersStarted = true

  connectEmscWebSocket()

  // Staggered low-frequency polling to reduce rate-limit pressure.
  startPollingSource('iss', 20_000, fetchIssEvent)
  startPollingSource('flight', 20_000, fetchAllFlightEvents)
  startPollingSource('celestrak', 60_000, fetchAllSatelliteEvents)
  if (AISHUB_USERNAME) {
    // AISHub guidance: no more than one request per minute
    startPollingSource('aishub', 60_000, fetchShipEvent)
  }
  startPollingSource('usgs', 120_000, fetchEarthquakeEvent)
  startPollingSource('eonet', 180_000, fetchEonetEvent)
  startPollingSource('openaq', 180_000, fetchAirQualityEvent)
}

export async function GET(request: NextRequest) {
  startSharedProducers()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('retry: 5000\n\n'))

      let active = true
      const interval = setInterval(() => {
        if (!active) return

        const payload = eventQueue.shift() ?? null

        if (payload) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
          return
        }

        // SSE heartbeat to keep the connection alive without fake notice events.
        controller.enqueue(encoder.encode(': keepalive\n\n'))
      }, eventFetchInterval)

      request.signal.addEventListener('abort', () => {
        active = false
        clearInterval(interval)
      })
    },

    cancel() {
      // Keep shared websocket streams alive for future clients.
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
