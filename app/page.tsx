import { WorldViewMap } from '@/components/WorldViewMap'

export default function HomePage() {
  return (
    <main className="bg-slate-950">
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-96 bg-hero-gradient opacity-80" />
        <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
          <div className="grid gap-16 lg:grid-cols-[minmax(450px,1fr)_420px] lg:items-center">
            <div className="max-w-2xl">
              <p className="mb-4 inline-flex rounded-full border border-sky-300/30 bg-sky-500/10 px-4 py-1 text-sm font-semibold uppercase tracking-[0.35em] text-sky-200">
                Open source world map
              </p>
              <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                Worldview is the realtime open map of the world.
              </h1>
              <p className="mt-6 text-xl leading-9 text-slate-300">
                Build a globally-scaled map product with open tiles, realtime event overlays, and live geospatial insights.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <a href="#map" className="inline-flex items-center justify-center rounded-full bg-sky-500 px-6 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-sky-500/30 transition hover:bg-sky-400">
                  View the map
                </a>
                <a href="/about" className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 px-6 py-3 text-base font-semibold text-slate-100 transition hover:border-slate-500">
                  About Worldview
                </a>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-glow">
                <h2 className="text-xl font-semibold text-white">Realtime overlays</h2>
                <p className="mt-3 text-slate-400">Stream live events onto the map from open data feeds and custom telemetry sources.</p>
              </div>
              <div className="rounded-3xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-glow">
                <h2 className="text-xl font-semibold text-white">Open map stack</h2>
                <p className="mt-3 text-slate-400">Use open-source tiles, MapLibre rendering, and a modern React interface for global situational awareness.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-8" id="map">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-sky-300">Realtime map</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Live coverage across the globe</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">
            Open-source world mapping with live event markers, distributed sensor points, and an extensible overlay pipeline.
          </p>
        </div>

        <WorldViewMap />
      </section>
    </main>
  )
}
