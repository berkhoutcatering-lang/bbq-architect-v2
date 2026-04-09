'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useOrg } from '@/lib/OrgContext';

// Tracks page visits and logs activity for health score computation
export function useActivityTracker() {
  const pathname = usePathname();
  const { orgId } = useOrg();
  const lastPageRef = useRef<string>('');
  const sessionLoggedRef = useRef(false);

  useEffect(function () {
    if (!orgId || !pathname) return;

    // Skip auth/public pages
    if (pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/auth') || pathname.startsWith('/q/') || pathname.startsWith('/invite')) {
      return;
    }

    // Don't log the same page twice in a row
    if (lastPageRef.current === pathname) return;
    lastPageRef.current = pathname;

    // Log page visit (fire-and-forget, non-blocking)
    fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'page_visit',
        page: pathname,
        organizationId: orgId,
      }),
    }).catch(function () { /* silent */ });
  }, [pathname, orgId]);

  // Log session start once
  useEffect(function () {
    if (!orgId || sessionLoggedRef.current) return;
    sessionLoggedRef.current = true;

    fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'session_start',
        page: pathname,
        organizationId: orgId,
      }),
    }).catch(function () { /* silent */ });
  }, [orgId, pathname]);
}

// Tracks onboarding milestones (call once per milestone)
export function logOnboardingMilestone(organizationId: string, milestone: string, metadata?: Record<string, unknown>) {
  return fetch('/api/onboarding-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ milestone, organizationId, metadata: metadata || {} }),
  }).catch(function () { /* silent */ });
}
