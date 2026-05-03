'use client';

/**
 * RealRouteMap — vraagt route over echte wegen op via OSRM en rendert
 * via MapLibre GL met OpenFreeMap dark tiles. Gracefully fallback naar
 * de SVG-versie (RittenMap) als geocoding/routing faalt.
 *
 * Stack:
 * - MapLibre GL JS (BSD, geen vendor-lock)
 * - OpenFreeMap "dark" style (gratis, geen API key, https://openfreemap.org)
 * - PDOK Locatieserver voor NL-geocoding (gratis, overheid-service)
 * - OSRM public demo voor route-geometry (gratis, fair-use)
 *
 * Cost: €0/maand voor v1. Schaalt tot honderden tenants binnen free tiers.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import RittenMap, { type LatLng, type MapRoute, type MapMarker } from './RittenMap';
import { geocodeNL, getOsrmRoute, computeBounds, type LngLat, type OsrmRoute } from './route-fetchers';

interface Props {
  vertrekAdres: string;
  aankomstAdres: string;
  /** Hex of CSS color voor de route line */
  routeColor?: string;
  height?: number;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'fallback'; reason: string }
  | { kind: 'ready'; from: LngLat; to: LngLat; route: OsrmRoute };

export default function RealRouteMap({
  vertrekAdres,
  aankomstAdres,
  routeColor = '#FFBF00',
  height = 460,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  // Phase 1: geocode + OSRM
  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      const [from, to] = await Promise.all([geocodeNL(vertrekAdres), geocodeNL(aankomstAdres)]);
      if (cancelled) return;
      if (!from || !to) {
        setState({ kind: 'fallback', reason: 'geocode-failed' });
        return;
      }
      const route = await getOsrmRoute(from, to);
      if (cancelled) return;
      if (!route) {
        setState({ kind: 'fallback', reason: 'osrm-failed' });
        return;
      }
      setState({ kind: 'ready', from, to, route });
    })();
    return () => {
      cancelled = true;
    };
  }, [vertrekAdres, aankomstAdres]);

  // Phase 2: render MapLibre once we have the route
  useEffect(() => {
    if (state.kind !== 'ready') return;
    if (!containerRef.current) return;

    const bounds = computeBounds([state.from, state.to]);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      bounds: bounds || undefined,
      fitBoundsOptions: { padding: 60, maxZoom: 14 },
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      // Route as GeoJSON line
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: state.route.coordinates },
        },
      });

      // Glow underneath
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': routeColor,
          'line-width': 12,
          'line-opacity': 0.18,
          'line-blur': 6,
        },
      });
      // Solid line on top
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': routeColor,
          'line-width': 4,
        },
      });

      // Start marker (home)
      const startEl = document.createElement('div');
      startEl.style.cssText = `
        width: 16px; height: 16px; border-radius: 50%;
        background: #FFBF00; border: 3px solid #0a0a0c;
        box-shadow: 0 0 0 4px rgba(255,191,0,0.25), 0 0 12px rgba(255,191,0,0.6);
      `;
      new maplibregl.Marker({ element: startEl })
        .setLngLat([state.from.lng, state.from.lat])
        .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setText(vertrekAdres))
        .addTo(map);

      // End marker (destination)
      const endEl = document.createElement('div');
      endEl.style.cssText = `
        width: 14px; height: 14px; border-radius: 50%;
        background: ${routeColor}; border: 3px solid #0a0a0c;
        box-shadow: 0 0 0 4px ${routeColor}40, 0 0 12px ${routeColor};
      `;
      new maplibregl.Marker({ element: endEl })
        .setLngLat([state.to.lng, state.to.lat])
        .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setText(aankomstAdres))
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [state, routeColor, vertrekAdres, aankomstAdres]);

  // Fallback: SVG-map when geocoding/routing failed
  const fallbackData = useMemo(() => {
    // Best-effort: use known city coords if PDOK said no
    const fallbackFrom: LatLng = [52.917, 6.799]; // Borger fallback
    const fallbackTo: LatLng = [52.785, 6.897]; // Emmen fallback
    const route: MapRoute[] = [
      { id: 'fallback', from: fallbackFrom, to: fallbackTo, color: routeColor, curvature: 0.18 },
    ];
    const markers: MapMarker[] = [
      { coord: fallbackFrom, kind: 'home', color: '#FFBF00', label: vertrekAdres.split(',')[0] },
      { coord: fallbackTo, kind: 'stop', color: routeColor, label: aankomstAdres.split(',')[0] },
    ];
    return { route, markers };
  }, [routeColor, vertrekAdres, aankomstAdres]);

  if (state.kind === 'fallback') {
    return (
      <div style={{ position: 'relative' }}>
        <RittenMap routes={fallbackData.route} markers={fallbackData.markers} activeRouteId="fallback" height={height} />
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            padding: '6px 10px',
            borderRadius: 8,
            background: 'rgba(18,18,21,0.85)',
            border: '1px solid rgba(196,163,90,0.3)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
          title={state.reason}
        >
          Schematische route
        </div>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div
        style={{
          width: '100%',
          height,
          borderRadius: 14,
          background: 'radial-gradient(ellipse at 30% 20%, #1a1a1f 0%, #0e0e10 50%, #0a0a0c 100%)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontSize: 12,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        <span>Route laden…</span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 1px 0 rgba(196,163,90,0.08), 0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          padding: '5px 11px',
          background: 'rgba(18,18,21,0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(196,163,90,0.3)',
          borderRadius: 999,
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: 'var(--brand)',
          pointerEvents: 'none',
        }}
      >
        Live route · {(state.route.distance / 1000).toFixed(1)} km · {Math.round(state.route.duration / 60)} min
      </div>
    </div>
  );
}
