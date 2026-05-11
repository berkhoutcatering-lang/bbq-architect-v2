/**
 * Kookbord — Prep-KDS hoofdroute (was /keuken/board?modus=mep).
 *
 * Mental model: dagen/uren vooraf werk dat per werkplek en per event
 * georkestreerd wordt. Multi-event, station-kolommen, swipe-to-done.
 *
 * Tegenhanger: /events/[id]/service voor wat tijdens een event gebeurt.
 */

import KookbordClient from './_components/KookbordClient';

export const dynamic = 'force-dynamic';

export default function KookbordPage() {
    return <KookbordClient />;
}
