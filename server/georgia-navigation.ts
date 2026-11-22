import { isCoordinates } from '../lib/georgia-map.ts';
import type { DrivingRoute, MapPlace } from '../lib/georgia-map.ts';

export async function georgiaNavigation(action: string, body: Record<string, unknown>, key: string) {
  const search = action === 'map-search';
  const { query, origin, destination } = body;
  if (search ? typeof query !== 'string' || query.trim().length < 2 || query.length > 120
    : !isCoordinates(origin) || !isCoordinates(destination)) {
    return { status: 400, data: { error: 'Choose a valid location' } };
  }

  const url = new URL(search ? '/pelias/v1/search' : '/openrouteservice/v2/directions/driving-car/geojson',
    'https://api.heigit.org');
  if (search) {
    url.search = new URLSearchParams({ text: String(query).trim(), 'boundary.country': 'GEO', size: '6' }).toString();
  }

  try {
    const response = await fetch(url, {
      method: search ? 'GET' : 'POST',
      headers: { Authorization: key, ...(search ? {} : { 'Content-Type': 'application/json' }) },
      body: search ? undefined : JSON.stringify({ coordinates: [origin, destination] }),
      signal: AbortSignal.timeout(6_000),
    });
    if (response.status === 429) return { status: 429, data: { error: 'Map service limit reached. Try again later' } };
    if (response.status === 404 && !search) return { status: 404, data: { error: 'No driving route found' } };
    if (!response.ok) return { status: 502, data: { error: 'Map service is temporarily unavailable' } };

    const result = await response.json();
    if (search) {
      const places: MapPlace[] = [];
      for (const feature of result.features ?? []) {
        const label = feature?.properties?.label;
        const point = feature?.geometry?.coordinates;
        if (typeof label === 'string' && isCoordinates(point)) places.push({ label, point });
      }
      return { status: 200, data: { places } };
    }

    const route = result.features?.[0];
    const points: unknown = route?.geometry?.coordinates;
    const { distance, duration } = route?.properties?.summary ?? {};
    if (!Array.isArray(points) || points.length < 2 || !points.every(isCoordinates)
      || !Number.isFinite(distance) || !Number.isFinite(duration)) {
      return { status: 404, data: { error: 'No driving route found' } };
    }
    const data: DrivingRoute = { points, distance, duration };
    return { status: 200, data };
  } catch {
    return { status: 502, data: { error: 'Map service is temporarily unavailable' } };
  }
}
