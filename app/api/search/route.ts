import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')

  if (!q?.trim()) {
    return NextResponse.json({ error: 'Query param is required' }, { status: 400 })
  }

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '5')
  url.searchParams.set('q', q)

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Worldview/0.1 (https://example.com)',
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch location results' }, { status: 502 })
  }

  const results = await response.json()
  return NextResponse.json(results)
}
