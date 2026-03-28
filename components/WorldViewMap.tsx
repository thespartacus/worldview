'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import MapComponent, { Marker, Source, Layer, MapRef, NavigationControl } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'

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

type SearchLocation = {
  display_name: string
  lat: string
  lon: string
}

type FeedTab = 'all' | 'flight' | 'ship' | 'seismic' | 'satellite' | 'air-quality' | 'natural' | 'other'

const STYLES = [
  { id: 'street', label: 'Street', url: 'https://demotiles.maplibre.org/style.json' },
  { id: 'dark', label: 'Dark', url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
]

const projectPoint = (lon: number, lat: number, bearingDeg: number, distanceKm: number): [number, number] => {
  const R = 6371
  const d = distanceKm / R
  const bearing = (bearingDeg * Math.PI) / 180
  const lat1 = (lat * Math.PI) / 180
  const lon1 = (lon * Math.PI) / 180
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing))
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [((lon2 * 180) / Math.PI + 540) % 360 - 180, Math.max(-90, Math.min(90, (lat2 * 180) / Math.PI))]
}

const sampleSensors = [
  { id: 'sensor-1', latitude: 37.78, longitude: -122.41, title: 'Bay Area Sensor', severity: 'low' },
  { id: 'sensor-2', latitude: 51.5, longitude: -0.12, title: 'London Observation Hub', severity: 'medium' },
  { id: 'sensor-3', latitude: 35.68, longitude: 139.76, title: 'Tokyo Realtime Node', severity: 'high' },
]

export function WorldViewMap() {
  const [events, setEvents] = useState<RealtimeEvent[]>([])
  const [flightTracks, setFlightTracks] = useState<Map<string, Array<[number, number]>>>(new Map())
  const [satelliteTracks, setSatelliteTracks] = useState<Map<string, Array<[number, number]>>>(new Map())
  const [feedTab, setFeedTab] = useState<FeedTab>('all')
  const [isConnected, setIsConnected] = useState(false)
  const [mapStyle, setMapStyle] = useState(STYLES[0].url)
  const [showSensors, setShowSensors] = useState(false)
  const [showEvents, setShowEvents] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchLocation[]>([])
  const [selectedLocation, setSelectedLocation] = useState<SearchLocation | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<RealtimeEvent | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 2,
    pitch: 0,
    bearing: 0,
  })
  const mapRef = useRef<MapRef | null>(null)

  const latestEvents = useMemo(() => events.slice(0, 20), [events])

  const getFeedEventType = (event: RealtimeEvent): Exclude<FeedTab, 'all'> => {
    const title = event.title.toLowerCase()
    const description = event.description.toLowerCase()

    if (event.callsign || title.includes('air traffic') || description.includes('flight')) return 'flight'
    if (event.shipMmsi || title.includes('maritime') || description.includes('vessel') || description.includes('ship')) return 'ship'
    if (event.satellite) return 'satellite'
    if (title.includes('earthquake') || description.includes('earthquake') || description.includes('seismic')) return 'seismic'
    if (title.includes('air quality') || description.includes('pm2.5') || description.includes('pm10')) return 'air-quality'
    if (
      title.includes('wildfire') ||
      title.includes('storm') ||
      title.includes('volcano') ||
      title.includes('flood') ||
      description.includes('wildfire') ||
      description.includes('storm') ||
      description.includes('volcano') ||
      description.includes('flood')
    ) {
      return 'natural'
    }

    return 'other'
  }

  const filteredFeedEvents = useMemo(() => {
    if (feedTab === 'all') return latestEvents.slice(0, 8)
    return latestEvents.filter((event) => getFeedEventType(event) === feedTab).slice(0, 8)
  }, [latestEvents, feedTab])

  const feedTabCounts = useMemo(() => {
    const counts: Record<Exclude<FeedTab, 'all'>, number> = {
      flight: 0,
      ship: 0,
      seismic: 0,
      satellite: 0,
      'air-quality': 0,
      natural: 0,
      other: 0,
    }

    for (const event of latestEvents) {
      counts[getFeedEventType(event)] += 1
    }

    return counts
  }, [latestEvents])

  const getEventGroupKey = (event: RealtimeEvent) => {
    if (event.callsign) return `flight:${event.callsign}`
    if (event.shipMmsi) return `ship:${event.shipMmsi}`
    if (event.title.toLowerCase().includes('air traffic')) return `flight:title:${event.title}`
    if (event.satellite) return `satellite:${event.satellite}`
    return `generic:${event.title}`
  }

  const eventGroups = useMemo(() => {
    const groups = new Map<string, RealtimeEvent[]>()

    for (const event of events) {
      const groupKey = getEventGroupKey(event)
      const existing = groups.get(groupKey) ?? []
      existing.push(event)
      groups.set(groupKey, existing)
    }

    return groups
  }, [events])

  const latestEventIds = useMemo(() => {
    const ids = new Set<string>()
    for (const group of eventGroups.values()) {
      if (group.length > 0) {
        ids.add(group[0].id)
      }
    }
    return ids
  }, [eventGroups])

  const getBearing = ([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) => {
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180
    const y = Math.sin(Δλ) * Math.cos(φ2)
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  }

  const selectedGroupKey = selectedEvent ? getEventGroupKey(selectedEvent) : null

  const isTrailDisabledEvent = (event: RealtimeEvent) => {
    const title = event.title.toLowerCase()
    const description = event.description.toLowerCase()
    return (
      title.includes('earthquake') ||
      description.includes('earthquake') ||
      title.includes('wildfire') ||
      description.includes('wildfire')
    )
  }

  const pathFeatures = useMemo(() => {
    const features = [] as Array<{ type: 'Feature'; geometry: { type: 'LineString'; coordinates: [number, number][] }; properties: { groupKey: string; highlighted: boolean } }>

    // Flight trails: use dedicated per-callsign track, only when that flight is selected
    if (selectedGroupKey?.startsWith('flight:') && !selectedGroupKey.startsWith('flight:title:') && selectedEvent) {
      const callsign = selectedGroupKey.slice('flight:'.length)
      const storedTrack = flightTracks.get(callsign)

      // Build trail: accumulated history → current position (if not already last point)
      const trail: Array<[number, number]> = storedTrack ? [...storedTrack] : [[selectedEvent.longitude, selectedEvent.latitude]]

      // Project forward using heading (~1500 km ahead = roughly 2h flight)
      const heading = selectedEvent.heading
      if (heading != null) {
        const last = trail[trail.length - 1]
        trail.push(projectPoint(last[0], last[1], heading, 1500))
      }

      if (trail.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: trail },
          properties: { groupKey: selectedGroupKey, highlighted: true },
        })
      }
    }

    // Satellite orbit path: use dedicated per-satellite track, only when selected
    if (selectedGroupKey?.startsWith('satellite:') && selectedEvent?.satellite) {
      const track = satelliteTracks.get(selectedEvent.satellite)
      if (track && track.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: track },
          properties: { groupKey: selectedGroupKey, highlighted: true },
        })
      }
    }

    // Non-flight trails (satellites etc.)
    for (const [groupKey, group] of eventGroups.entries()) {
      if (groupKey.startsWith('flight:')) continue
      if (groupKey.startsWith('satellite:')) continue
      if (group.length < 2) continue
      if (isTrailDisabledEvent(group[0])) continue

      const coordinates = [...group].reverse().map((event) => [event.longitude, event.latitude] as [number, number])
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: { groupKey, highlighted: selectedGroupKey === groupKey },
      })
    }

    return {
      type: 'FeatureCollection' as const,
      features,
    }
  }, [eventGroups, selectedGroupKey, flightTracks, satelliteTracks, selectedEvent])

  const getEventRotation = (event: RealtimeEvent) => {
    const group = eventGroups.get(getEventGroupKey(event))
    if (!group || group.length < 2 || group[0]?.id !== event.id) return 0
    const previous = group[1]
    if (!previous) return 0
    return getBearing([previous.longitude, previous.latitude], [event.longitude, event.latitude])
  }

  const fetchSearchResults = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    setSearchLoading(true)
    setSearchError('')

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)

      if (!response.ok) {
        throw new Error('Search request failed')
      }

      const data = (await response.json()) as SearchLocation[]
      setSearchResults(data)
    } catch (error) {
      setSearchError('Search unavailable. Try again in a moment.')
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [searchQuery])

  const handleFollowEvent = useCallback((event: RealtimeEvent) => {
    setSelectedEvent((current) => {
      const isSameEvent = current?.id === event.id

      if (isSameEvent) {
        mapRef.current?.flyTo({
          center: [0, 0],
          zoom: 2,
          pitch: 0,
          bearing: 0,
          duration: 1000,
        })
        setViewState({
          longitude: 0,
          latitude: 0,
          zoom: 2,
          pitch: 0,
          bearing: 0,
        })
        return null
      }

      mapRef.current?.flyTo({
        center: [event.longitude, event.latitude],
        zoom: 6,
        pitch: 45,
        bearing: 0,
        offset: [0, -120],
        duration: 1000,
      })
      setViewState((state) => ({
        ...state,
        longitude: event.longitude,
        latitude: event.latitude,
        zoom: 6,
        pitch: 45,
        bearing: 0,
      }))
      return event
    })
  }, [])

  const handleSelectLocation = useCallback((location: SearchLocation) => {
    mapRef.current?.flyTo({
      center: [Number(location.lon), Number(location.lat)],
      zoom: 8,
      pitch: 35,
      bearing: 0,
      duration: 1000,
    })
    setSelectedLocation(location)
    setViewState((state) => ({
      ...state,
      longitude: Number(location.lon),
      latitude: Number(location.lat),
      zoom: 8,
      pitch: 35,
      bearing: 0,
    }))
    setSearchResults([])
  }, [])

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      fetchSearchResults()
    },
    [fetchSearchResults],
  )

  const getEventMarkerAppearance = (event: RealtimeEvent) => {
    const title = event.title.toLowerCase()
    const description = event.description.toLowerCase()
    const isFlight = Boolean(event.callsign)
    const isShip = Boolean(event.shipMmsi) || title.includes('maritime') || description.includes('vessel') || description.includes('ship')
    const isSatellite = Boolean(event.satellite) && !isFlight
    const isSeismic = title.includes('earthquake') || description.includes('earthquake')

    if (isFlight) {
      return {
        emoji: '✈️',
        label: 'Flight',
        ring: 'from-sky-400 to-cyan-400',
        bg: 'bg-sky-500/95',
        text: 'text-slate-950',
        rotate: '-rotate-12',
      }
    }

    if (isSatellite) {
      return {
        emoji: '🛰️',
        label: 'Satellite',
        ring: 'from-violet-500 to-fuchsia-500',
        bg: 'bg-violet-500/95',
        text: 'text-white',
        rotate: 'rotate-0',
      }
    }

    if (isShip) {
      return {
        emoji: '🚢',
        label: 'Ship',
        ring: 'from-cyan-400 to-teal-400',
        bg: 'bg-cyan-500/95',
        text: 'text-slate-950',
        rotate: 'rotate-0',
      }
    }

    if (isSeismic) {
      return {
        emoji: '🌍',
        label: 'Seismic',
        ring: 'from-amber-400 to-rose-500',
        bg: 'bg-amber-500/95',
        text: 'text-slate-950',
        rotate: 'rotate-0',
      }
    }

    return {
      emoji: '⚡',
      label: 'Alert',
      ring: 'from-sky-400 to-blue-500',
      bg: 'bg-sky-500/95',
      text: 'text-slate-950',
      rotate: 'rotate-0',
    }
  }

  useEffect(() => {
    const source = new EventSource('/api/realtime')

    source.onopen = () => setIsConnected(true)
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent | RealtimeEvent[]

        if (Array.isArray(payload)) {
          const hasFlightSnapshot = payload.some((item) => Boolean(item.callsign))
          const hasSatelliteSnapshot = payload.some((item) => Boolean(item.satellite) && !item.callsign)

          setEvents((previous) => {
            let base = previous
            if (hasFlightSnapshot) {
              base = base.filter((item) => !item.callsign)
            }
            if (hasSatelliteSnapshot) {
              base = base.filter((item) => !(item.satellite && !item.callsign))
            }

            const payloadIds = new Set(payload.map((item) => item.id))
            const remaining = base.filter((item) => !payloadIds.has(item.id))
            return [...payload, ...remaining].slice(0, 12000)
          })

          if (hasFlightSnapshot) {
            setFlightTracks((prev) => {
              const next = new Map(prev)
              for (const flight of payload) {
                if (!flight.callsign) continue
                const track = next.get(flight.callsign) ?? []
                next.set(flight.callsign, [...track, [flight.longitude, flight.latitude] as [number, number]].slice(-100))
              }
              return next
            })
          }

          if (hasSatelliteSnapshot) {
            setSatelliteTracks((prev) => {
              const next = new Map(prev)
              for (const sat of payload) {
                if (!sat.satellite || sat.callsign) continue
                const track = next.get(sat.satellite) ?? []
                next.set(sat.satellite, [...track, [sat.longitude, sat.latitude] as [number, number]].slice(-240))
              }
              return next
            })
          }

          return
        }

        setEvents((previous) => [payload, ...previous].slice(0, 8000))
        if (payload.callsign) {
          setFlightTracks((prev) => {
            const next = new Map(prev)
            const track = next.get(payload.callsign!) ?? []
            next.set(payload.callsign!, ([...track, [payload.longitude, payload.latitude]] as Array<[number, number]>).slice(-100))
            return next
          })
        }
        if (payload.satellite && !payload.callsign) {
          setSatelliteTracks((prev) => {
            const next = new Map(prev)
            const track = next.get(payload.satellite!) ?? []
            next.set(payload.satellite!, ([...track, [payload.longitude, payload.latitude]] as Array<[number, number]>).slice(-240))
            return next
          })
        }
      } catch {
        // ignore invalid payloads
      }
    }

    source.onerror = () => {
      setIsConnected(false)
      source.close()
    }

    return () => source.close()
  }, [])

  return (
    <div className="relative h-screen overflow-hidden bg-slate-950">
      <div className="absolute inset-0">
        <MapComponent
          ref={mapRef}
          mapLib={maplibregl}
          initialViewState={viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle={mapStyle}
          projection="globe"
          padding={{ top: 24, left: 24, right: 420, bottom: 320 }}
        >
          <NavigationControl position="top-left" />

          {showSensors &&
            sampleSensors.map((sensor) => (
              <Marker key={sensor.id} longitude={sensor.longitude} latitude={sensor.latitude} anchor="bottom">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/90 text-[0.75rem] font-semibold text-slate-950 shadow-lg">
                  S
                </div>
              </Marker>
            ))}

          {showEvents && pathFeatures.features.length > 0 && (
            <Source id="event-paths" type="geojson" data={pathFeatures}>
              <Layer
                id="event-trails"
                type="line"
                paint={{
                  'line-color': ['case', ['boolean', ['get', 'highlighted'], false], '#38bdf8', '#94a3b8'],
                  'line-width': 3,
                  'line-opacity': ['case', ['boolean', ['get', 'highlighted'], false], 0.95, 0.38],
                  'line-dasharray': [2, 4],
                }}
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              />
            </Source>
          )}

          {showEvents &&
            events.map((event) => {
              const isActive = selectedEvent?.id === event.id
              const marker = getEventMarkerAppearance(event)
              const isLatest = latestEventIds.has(event.id)
              const isTrailDisabled = isTrailDisabledEvent(event)
              const isFlight = Boolean(event.callsign)
              if (!isLatest && !isTrailDisabled && !isFlight) return null
              const rotation = isTrailDisabled ? 0 : getEventRotation(event)

              return (
                <Marker key={event.id} longitude={event.longitude} latitude={event.latitude} anchor="center">
                  <button
                    type="button"
                    aria-label={`${marker.label} event: ${event.title}`}
                    onClick={() => handleFollowEvent(event)}
                    className={`inline-flex items-center justify-center p-1 text-3xl transition focus:outline-none ${isActive ? 'scale-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.25)]' : 'hover:scale-110'} ${marker.text}`}
                    style={{ transform: `rotate(${rotation}deg)` }}
                  >
                    {marker.emoji}
                  </button>
                </Marker>
              )
            })}
        </MapComponent>
      </div>
      <div className="absolute inset-x-6 bottom-6 rounded-3xl border border-slate-800/90 bg-slate-950/90 p-4 shadow-xl backdrop-blur-sm backdrop-saturate-150 bg-slate-950/80 ring-1 ring-slate-800/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300">Worldview controls</p>
            <p className="text-sm text-slate-300">Switch basemaps, search locations, and inspect live feed activity.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={isConnected ? 'inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400' : 'inline-flex h-2.5 w-2.5 rounded-full bg-rose-500'} />
            <span className="text-xs uppercase tracking-[0.35em] text-slate-300">
              {isConnected ? 'Realtime feed connected' : 'Offline — retrying'}
            </span>
          </div>
        </div>

        {selectedEvent && (
          <div className="mt-4 rounded-3xl border border-sky-500/20 bg-sky-500/10 p-4 text-slate-100 shadow-glow">
            <p className="text-xs uppercase tracking-[0.35em] text-sky-200">Selected event</p>
            <p className="mt-2 font-semibold text-white">{selectedEvent.title}</p>
            <p className="mt-1 text-sm text-slate-300">{selectedEvent.description}</p>
            <div className="mt-3 grid gap-3 text-xs uppercase tracking-[0.35em] text-slate-400 sm:grid-cols-2">
              <div>
                <p className="font-semibold text-slate-100">Location</p>
                <p>{selectedEvent.latitude.toFixed(4)}, {selectedEvent.longitude.toFixed(4)}</p>
              </div>
              {selectedEvent.origin && (
                <div>
                  <p className="font-semibold text-slate-100">Country of origin</p>
                  <p>{selectedEvent.origin}</p>
                </div>
              )}
              {selectedEvent.callsign && (
                <div>
                  <p className="font-semibold text-slate-100">Callsign</p>
                  <p>{selectedEvent.callsign}</p>
                </div>
              )}
              {selectedEvent.shipMmsi && (
                <div>
                  <p className="font-semibold text-slate-100">MMSI</p>
                  <p>{selectedEvent.shipMmsi}</p>
                </div>
              )}
              {selectedEvent.shipName && (
                <div>
                  <p className="font-semibold text-slate-100">Vessel</p>
                  <p>{selectedEvent.shipName}</p>
                </div>
              )}
              {selectedEvent.altitude != null && (
                <div>
                  <p className="font-semibold text-slate-100">Altitude</p>
                  <p>{selectedEvent.altitude.toFixed(0)} m</p>
                </div>
              )}
            {selectedEvent.velocity != null && (
              <div className="sm:col-span-2">
                <p className="font-semibold text-slate-100">Speed</p>
                <p>{(selectedEvent.velocity * 3.6).toFixed(0)} km/h</p>
              </div>
            )}
            {selectedEvent.satellite && (
              <div className="sm:col-span-2">
                <p className="font-semibold text-slate-100">Satellite</p>
                <p>{selectedEvent.satellite}</p>
              </div>
            )}
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.35em] text-slate-400">
            Severity: {selectedEvent.severity}
          </p>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">Basemap</label>
            <div className="grid grid-cols-2 gap-2">
              {STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setMapStyle(style.url)}
                  className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                    mapStyle === style.url
                      ? 'border-sky-400 bg-sky-500/10 text-sky-200'
                      : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">Live layers</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowSensors((value) => !value)}
                className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                  showSensors
                    ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                    : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500'
                }`}
              >
                Sensors
              </button>
              <button
                type="button"
                onClick={() => setShowEvents((value) => !value)}
                className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                  showEvents
                    ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                    : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500'
                }`}
              >
                Events
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-slate-800/80 bg-slate-900/80 p-3">
          <label className="sr-only" htmlFor="worldview-search">
            Search locations
          </label>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              id="worldview-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search cities, landmarks, coordinates"
              className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
            />
            <button
              type="submit"
              disabled={searchLoading}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold text-slate-950 transition ${
                searchLoading
                  ? 'cursor-wait bg-slate-700 text-slate-400'
                  : 'bg-sky-500 hover:bg-sky-400'
              }`}
              aria-busy={searchLoading}
            >
              {searchLoading ? 'Searching…' : 'Go'}
            </button>
          </form>
          {searchError && <p className="mt-3 text-xs text-rose-300">{searchError}</p>}
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              {searchResults.map((location, index) => (
                <button
                  key={`${location.lat}-${location.lon}-${location.display_name}-${index}`}
                  type="button"
                  onClick={() => handleSelectLocation(location)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-left text-slate-200 transition hover:border-sky-400"
                >
                  <span className="block font-semibold text-slate-100">{location.display_name}</span>
                  <span className="text-xs text-slate-400">{Number(location.lat).toFixed(4)}, {Number(location.lon).toFixed(4)}</span>
                </button>
              ))}
            </div>
          )}
          {selectedLocation && searchResults.length === 0 && (
            <div className="mt-3 rounded-2xl bg-slate-950/80 px-3 py-2 text-xs text-slate-400">
              Focused on <span className="text-slate-100">{selectedLocation.display_name}</span>
            </div>
          )}
        </div>
      </div>
      <aside className="hidden lg:block absolute right-6 top-6 w-[380px] space-y-6 border border-slate-800/80 bg-slate-950/90 p-6 shadow-xl">
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-glow">
          <h2 className="text-lg font-semibold text-white">Live event feed</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">Click an event to center the map and inspect its status.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { id: 'all' as const, label: 'All', count: latestEvents.length },
              { id: 'flight' as const, label: 'Flights', count: feedTabCounts.flight },
              { id: 'ship' as const, label: 'Ships', count: feedTabCounts.ship },
              { id: 'seismic' as const, label: 'Seismic', count: feedTabCounts.seismic },
              { id: 'satellite' as const, label: 'Satellite', count: feedTabCounts.satellite },
              { id: 'air-quality' as const, label: 'Air', count: feedTabCounts['air-quality'] },
              { id: 'natural' as const, label: 'Natural', count: feedTabCounts.natural },
              { id: 'other' as const, label: 'Other', count: feedTabCounts.other },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFeedTab(tab.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  feedTab === tab.id
                    ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                    : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500'
                }`}
              >
                {tab.label} <span className="text-slate-400">{tab.count}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 max-h-[320px] overflow-y-auto pr-1">
            {filteredFeedEvents.length === 0 ? (
              <p className="text-sm text-slate-500">No events in this tab yet. Waiting for realtime updates…</p>
            ) : (
              <div className="space-y-3">
                {filteredFeedEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => handleFollowEvent(event)}
                    className="w-full rounded-3xl border border-slate-800/80 bg-slate-950/90 px-4 py-4 text-left transition hover:border-sky-400"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{event.title}</p>
                        <p className="mt-1 text-sm text-slate-400">{event.description}</p>
                      </div>
                      <span
                        className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${
                          event.severity === 'high'
                            ? 'bg-rose-500/15 text-rose-200'
                            : event.severity === 'medium'
                            ? 'bg-amber-400/10 text-amber-200'
                            : 'bg-sky-400/10 text-sky-200'
                        }`}
                      >
                        {event.severity.toUpperCase()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-glow">
          <h3 className="text-base font-semibold text-white">Legend</h3>
          <dl className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-500/90 text-sm text-slate-950 shadow-lg">S</span>
              <p>Open sensors and telemetry nodes.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-500/90 text-lg text-slate-950 shadow-xl">✈️</span>
              <p>Air traffic / flight events.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-violet-500/90 text-lg text-white shadow-xl">🛰️</span>
              <p>Orbital satellite observations.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-500/95 text-lg text-slate-950 shadow-xl">🌍</span>
              <p>Seismic and ground-impact events.</p>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  )
}
