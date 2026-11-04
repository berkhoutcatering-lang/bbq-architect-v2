/**
 * VoorraadHeader + global ScanFab
 * ───────────────────────────────
 * Gedeelde top-band voor de drie voorraad-pages (/voorraad, /inkoop,
 * /leveranciers). De tabbladen staan sinds 2026-10-20 in de werkruimtebalk.
 * Combineert:
 *  - EventSpine — pillar #1 (event-aware voorraad), de rode draad
 *  - ScanFab — pillar #3 (10-sec foto-bon), altijd rechtsonder aanwezig
 *
 * Eén plek om aan te passen i.p.v. drie identieke layout.tsx-files.
 * Onder /voorraad/winkel niet: dat is de winkel, niet de cateringvoorraad.
 */
import EventSpine from '@/components/voorraad/EventSpine';
import NietInDeWinkel from '@/components/voorraad/NietInDeWinkel';
import ScanFab from '@/components/voorraad/ScanFab';

export default function VoorraadHeader() {
  return (
    <NietInDeWinkel>
      <div style={{ padding: '16px 32px 0' }}>
        <EventSpine />
      </div>
      <ScanFab />
    </NietInDeWinkel>
  );
}
