/**
 * VoorraadHeader + global ScanFab
 * ───────────────────────────────
 * Gedeelde top-band voor de drie voorraad-pages (/voorraad, /inkoop,
 * /leveranciers). Combineert:
 *  - HubTabs (VoorraadTabs)
 *  - EventSpine — pillar #1 (event-aware voorraad), de rode draad
 *  - ScanFab — pillar #3 (10-sec foto-bon), altijd rechtsonder aanwezig
 *
 * Eén plek om aan te passen i.p.v. drie identieke layout.tsx-files.
 */
import VoorraadTabs from '@/components/VoorraadTabs';
import EventSpine from '@/components/voorraad/EventSpine';
import ScanFab from '@/components/voorraad/ScanFab';

export default function VoorraadHeader() {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <VoorraadTabs />
        <EventSpine />
      </div>
      <ScanFab />
    </>
  );
}
