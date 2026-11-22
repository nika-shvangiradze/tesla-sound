'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { findGeorgianPlaces, googleDirections, googlePlaceSearch, isCoordinates } from '../lib/georgia-map';
import type { Coordinates, DrivingRoute, MapPlace } from '../lib/georgia-map';
import { accountRequest } from './account';
import { useLanguage } from './language';

const GEORGIA_VIEW: L.LatLngBoundsExpression = [[41.0, 39.9], [43.7, 46.8]];
const toLatLng = ([lng, lat]: Coordinates): L.LatLngTuple => [lat, lng];

export default function GeorgiaMap() {
  const { t, language } = useLanguage();
  const canvas = useRef<HTMLDivElement>(null);
  const layers = useRef<{ map: L.Map; start: L.CircleMarker; end: L.CircleMarker; route: L.Polyline } | null>(null);
  const gpsWatch = useRef<number | null>(null);
  const searchRequest = useRef(0);
  const routeRequest = useRef(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MapPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [routing, setRouting] = useState(false);
  const [pickStart, setPickStart] = useState(false);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('');
  const [searchMessage, setSearchMessage] = useState('');
  const [externalQuery, setExternalQuery] = useState('');
  const [embeddedDirections, setEmbeddedDirections] = useState(false);
  const [routeMessage, setRouteMessage] = useState('');
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [destination, setDestination] = useState<MapPlace | null>(null);
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void accountRequest<{ embeddedDirections: boolean }>({ action: 'map-status' })
      .then((status) => { if (active) setEmbeddedDirections(status.embeddedDirections); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!canvas.current) return;
    const map = L.map(canvas.current, { scrollWheelZoom: false, doubleClickZoom: false });
    map.fitBounds(GEORGIA_VIEW);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).on('tileerror', () => setTilesFailed(true))
      .on('tileload', () => setTilesFailed(false))
      .addTo(map);
    layers.current = {
      map,
      start: L.circleMarker([0, 0], { color: '#fff', fillColor: '#138bdb', fillOpacity: 1, radius: 8 }),
      end: L.circleMarker([0, 0], { color: '#fff', fillColor: '#d34c50', fillOpacity: 1, radius: 8 }),
      route: L.polyline([], { color: '#176ed1', weight: 6, opacity: 0.9 }).addTo(map),
    };
    const resize = typeof ResizeObserver === 'undefined' ? null
      : new ResizeObserver(() => { map.invalidateSize({ pan: false }); });
    resize?.observe(canvas.current);
    return () => {
      resize?.disconnect();
      layers.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => () => {
    if (gpsWatch.current !== null) navigator.geolocation.clearWatch(gpsWatch.current);
  }, []);

  function stopGps() {
    if (gpsWatch.current !== null) navigator.geolocation.clearWatch(gpsWatch.current);
    gpsWatch.current = null;
    setGpsOn(false);
    setGpsMessage('');
  }

  function clearRoute() {
    routeRequest.current += 1;
    setRouting(false);
    setRoute(null);
    setRouteMessage('');
  }

  useEffect(() => {
    const map = layers.current?.map;
    if (!map) return;
    const selectPoint = ({ latlng }: L.LeafletMouseEvent) => {
      const point: Coordinates = [latlng.lng, latlng.lat];
      if (!isCoordinates(point)) return;
      if (pickStart) {
        setOrigin(point);
        setPickStart(false);
      } else {
        searchRequest.current += 1;
        setSearching(false);
        setDestination({ label: '', point });
        setQuery('');
        setResults([]);
        setSearchMessage('');
        setExternalQuery('');
      }
      clearRoute();
    };
    map.on('click', selectPoint);
    return () => { map.off('click', selectPoint); };
  }, [pickStart]);

  useEffect(() => {
    const view = layers.current;
    if (!view || !origin) return;
    view.start.setLatLng(toLatLng(origin)).addTo(view.map);
  }, [origin]);

  useEffect(() => {
    const view = layers.current;
    if (!view) return;
    if (destination) view.end.setLatLng(toLatLng(destination.point)).addTo(view.map);
    else view.end.remove();
  }, [destination]);

  useEffect(() => {
    const view = layers.current;
    if (!view) return;
    view.route.setLatLngs(route ? route.points.map(toLatLng) : []);
    if (route) view.map.fitBounds(view.route.getBounds(), { padding: [24, 24], maxZoom: 16 });
  }, [route]);

  function startGps() {
    if (!navigator.geolocation) {
      setGpsMessage('GPS is unavailable in this browser');
      return;
    }
    if (gpsWatch.current !== null) return;
    clearRoute();
    setPickStart(false);
    setOrigin(null);
    layers.current?.start.remove();
    setGpsOn(true);
    setGpsMessage('Waiting for your location');
    let firstFix = true;
    gpsWatch.current = navigator.geolocation.watchPosition(({ coords }) => {
      const point = [coords.longitude, coords.latitude];
      if (gpsWatch.current === null || !isCoordinates(point)) return;
      setOrigin(point);
      setGpsMessage('Live location');
      if (firstFix && layers.current) {
        const { map, end } = layers.current;
        if (map.hasLayer(end)) map.fitBounds(L.latLngBounds(toLatLng(point), end.getLatLng()), { padding: [35, 35], maxZoom: 15 });
        else map.setView(toLatLng(point), 14);
      }
      firstFix = false;
    }, (error) => {
      if (gpsWatch.current === null) return;
      if (error.code === 1) stopGps();
      setGpsMessage(error.code === 1 ? 'Location permission was denied' : 'Waiting for a new GPS signal');
    }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 });
  }

  async function searchPlaces() {
    const term = query.trim();
    if (term.length < 2) return;
    setDestination(null);
    clearRoute();
    const places = findGeorgianPlaces(term, language);
    setResults(places);
    setSearchMessage('');
    setExternalQuery('');
    if (places.length || !embeddedDirections) {
      if (!places.length) setExternalQuery(term);
      return;
    }
    const request = ++searchRequest.current;
    setSearching(true);
    try {
      const result = await accountRequest<{ places: MapPlace[] }>({ action: 'map-search', query: term });
      if (request !== searchRequest.current) return;
      setResults(result.places);
      if (!result.places.length) setExternalQuery(term);
    } catch {
      if (request !== searchRequest.current) return;
      setSearchMessage('Map search is temporarily unavailable');
      setExternalQuery(term);
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  }

  async function buildRoute() {
    if (!origin || !destination || routing || !embeddedDirections) return;
    const request = ++routeRequest.current;
    setRouteMessage('');
    setRouting(true);
    try {
      const result = await accountRequest<DrivingRoute>({ action: 'map-route', origin, destination: destination.point });
      if (request === routeRequest.current) setRoute(result);
    } catch (error) {
      if (request === routeRequest.current) {
        setRouteMessage(error instanceof Error ? error.message : 'Map service is temporarily unavailable');
      }
    } finally {
      if (request === routeRequest.current) setRouting(false);
    }
  }

  return (
    <section className="panel georgia-map" id="georgia-map" aria-labelledby="georgia-map-title">
      <div className="panel-heading"><h2 id="georgia-map-title">{t('Map of Georgia')}</h2></div>
      <div className="georgia-map-body">
        <div className="map-sidebar">
          <form className="map-search" onSubmit={(event) => { event.preventDefault(); void searchPlaces(); }}>
            <label htmlFor="map-place">{t('Find a place in Georgia')}</label>
            <div className="map-search-row">
              <input id="map-place" value={query} onChange={(event) => {
                setQuery(event.target.value);
                setResults([]);
                setSearchMessage('');
                setExternalQuery('');
              }} placeholder={t('e.g. airport or Batumi')} maxLength={120} disabled={searching} />
              <button className="button" disabled={searching || query.trim().length < 2}>{t('Search')}</button>
            </div>
          </form>
          {results.length > 0 && <ul className="map-results">
            {results.map((place) => <li key={place.label + place.point.join(',')}>
              <button type="button" className="button" onClick={() => {
                clearRoute();
                setPickStart(false);
                setDestination(place);
                setQuery(place.label);
                setResults([]);
                const map = layers.current?.map;
                if (origin) map?.fitBounds([toLatLng(origin), toLatLng(place.point)], { padding: [35, 35], maxZoom: 15 });
                else map?.setView(toLatLng(place.point), 14);
              }}>{place.label}</button>
            </li>)}
          </ul>}
          {externalQuery && <div className="map-search-fallback">
            <p className="map-note">{t('Find the address in Google Maps or tap the map to set a pin')}</p>
            <a className="button" href={googlePlaceSearch(externalQuery)} target="_blank" rel="noopener noreferrer">
              {t('Search in Google Maps')}
            </a>
          </div>}
          <div className="map-start-actions">
            <button type="button" className="button" onClick={gpsOn ? stopGps : startGps}>{t(gpsOn ? 'Stop location' : 'Use my location')}</button>
            <button type="button" className="button" aria-pressed={pickStart} onClick={() => {
              if (!pickStart) stopGps();
              setPickStart(!pickStart);
              clearRoute();
            }}>{t('Pick start on map')}</button>
          </div>
          <p className="map-note">{t(pickStart ? 'Tap the map to mark your starting point' : 'Search or tap the map to choose a destination')}</p>
          {gpsMessage && <p className="map-note" role="status">{t(gpsMessage)}</p>}
          {searchMessage && <p className="map-note" role="status">{t(searchMessage)}</p>}
          <dl className="map-endpoints">
            <div><dt>{t('Starting point')}</dt><dd>{origin ? t(gpsOn ? 'My location' : 'Selected point') : '—'}</dd></div>
            <div><dt>{t('Destination')}</dt><dd>{destination ? destination.label || t('Map pin') : '—'}</dd></div>
          </dl>
          <div className="map-route-actions">
            {embeddedDirections && <button type="button" className="button primary" onClick={() => void buildRoute()} disabled={!origin || !destination || routing}>
              {t(routing ? 'Building route…' : 'Show driving route')}
            </button>}
            {destination && <a className={embeddedDirections ? 'button' : 'button primary'}
              href={googleDirections(destination.googleDestination ?? destination.point, origin ?? undefined)}
              target="_blank" rel="noopener noreferrer">{t('Directions in Google Maps')}</a>}
          </div>
          {destination && !origin && <p className="map-note">{t('Use your location or choose a starting point on the map')}</p>}
          {routeMessage && <p className="map-note" role="status">{t(routeMessage)}</p>}
          {route && <p className="map-route-summary" role="status">
            {t('{distance} km · about {minutes} min', {
              distance: (route.distance / 1_000).toLocaleString(language, { maximumFractionDigits: 1 }),
              minutes: Math.max(1, Math.round(route.duration / 60)),
            })}
          </p>}
          {embeddedDirections && <>
            <p className="map-note">{t('Searching and building a route send the query or selected points to the map provider')}</p>
            <a className="map-provider" href="https://openrouteservice.org/" target="_blank" rel="noopener noreferrer">openrouteservice by HeiGIT</a>
          </>}
        </div>
        <div className="map-view">
          <div className="map-canvas" ref={canvas} aria-label={t('Map of Georgia')} />
          {tilesFailed && <p className="map-note" role="status">{t('Some map tiles could not load')}</p>}
        </div>
      </div>
    </section>
  );
}
