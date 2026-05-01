'use client';

import React from 'react';
import VerticalTimeline from '@/components/charts/VerticalTimeline';
import type { VerticalTimelineItem } from '@/components/charts/VerticalTimeline';

export interface ActiviteitData {
  items: VerticalTimelineItem[];
}

interface Props {
  data: ActiviteitData;
}

export default function ZoneActiviteit({ data }: Props) {
  return (
    <div
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: 'var(--space-6)',
      }}
    >
      <VerticalTimeline items={data.items} />
    </div>
  );
}
