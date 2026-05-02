'use client';

import React from 'react';

/**
 * V1: weer-API ontbreekt nog. Component returnt `null` zonder data zodat de
 * pagina niet wordt belast met een lege placeholder. Skeleton blijft staan
 * voor wanneer KNMI/OpenWeather koppeling later wordt ingebouwd — dan vullen
 * we deze met een grid van per-event tegels (icoon + temp + regen + wind +
 * confidence-pill).
 */

export interface WeatherEvent {
  eventTitle: string;
  daysAway: number;
  location: string;
  guests: number;
  forecast: {
    temp: number;
    low: number;
    condition: string;
    rain: number;
    wind: number;
    icon: string;
  };
  confidence: 'high' | 'medium' | 'low';
}

interface Props {
  events?: WeatherEvent[];
}

export default function WeatherStrip({ events }: Props): React.ReactElement | null {
  if (!events || events.length === 0) return null;
  // Toekomstige render — voor nu null tot KNMI aangesloten is.
  return null;
}
