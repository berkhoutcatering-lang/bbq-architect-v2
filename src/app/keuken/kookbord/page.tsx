/**
 * Kookbord — Prep-KDS hoofdroute (was /keuken/board?modus=mep).
 *
 * Mental model: dagen/uren vooraf werk dat per werkplek en per event
 * georkestreerd wordt. Multi-event, station-kolommen, swipe-to-done.
 *
 * Tegenhanger: /events/[id]/service voor wat tijdens een event gebeurt.
 */

import { Suspense } from 'react';
import KookbordClient from './_components/KookbordClient';

export const dynamic = 'force-dynamic';

/* Suspense: KookbordClient leest ?event= via useSearchParams (webshop-vakje → kookbord). */
export default function KookbordPage() {
    return <Suspense fallback={null}><KookbordClient /></Suspense>;
}
