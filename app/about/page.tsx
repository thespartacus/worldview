import Link from 'next/link'

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20 lg:px-8">
      <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-10 shadow-glow">
        <p className="text-sm uppercase tracking-[0.3em] text-sky-300">About Worldview</p>
        <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">Realtime open-source geospatial intelligence.</h1>
        <p className="mt-6 text-lg leading-8 text-slate-300">
          Worldview is a live world map platform built with open-source tooling and open data. The product integrates global tiles, realtime event feeds, and extensible overlay controls so anyone can visualize situational awareness.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/90 p-6">
            <h2 className="text-xl font-semibold text-white">Open map stack</h2>
            <p className="mt-3 text-slate-400">Built with MapLibre and open tile styles to avoid proprietary lock-in and keep the map stack fully transparent.</p>
          </div>
          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/90 p-6">
            <h2 className="text-xl font-semibold text-white">Realtime feeds</h2>
            <p className="mt-3 text-slate-400">Supports live streams of event markers, telemetry updates, and remote observation overlays through an open API.</p>
          </div>
        </div>

        <div className="mt-10 space-y-6 text-slate-300">
          <div>
            <h3 className="text-xl font-semibold text-white">What this prototype includes</h3>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Global open-source basemap powered by MapLibre</li>
              <li>Realtime event streaming via Server-Sent Events</li>
              <li>Live map markers for sensors, incidents, and satellite passes</li>
              <li>Modern Next.js frontend and extensible layer controls</li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white">Next steps</h3>
            <p className="mt-3 text-slate-400">Add open data overlays, user-defined geofences, clustering, search, and support for community-uploaded feeds to build the full Worldview product.</p>
          </div>
        </div>
      </div>

      <div className="mt-8 text-sm text-slate-400">
        <Link href="/" className="text-sky-300 hover:text-sky-100">← Back to live map</Link>
      </div>
    </main>
  )
}
