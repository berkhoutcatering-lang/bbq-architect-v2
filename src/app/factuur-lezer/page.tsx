'use client';

import { useMemo } from 'react';
import { ScanLine, Image as ImageIcon, Receipt } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import HubCard from '@/components/HubCard';
import { useSupabase } from '@/lib/useSupabase';
import { fmt } from '@/lib/utils';

interface BonRow { id: number; created_at?: string; datum?: string; bedrag?: number }
interface PhotoRow { id: number; created_at?: string; categorie?: string }
interface PricelistRow { id: number; created_at?: string; leverancier?: string }

export default function FactuurLezerHub() {
  const { data: bonnen, loading: loadingBonnen } = useSupabase<BonRow>('bonnen', []);
  const { data: photos, loading: loadingPhotos } = useSupabase<PhotoRow>('photo_logbook', []);
  const { data: pricelists, loading: loadingPL } = useSupabase<PricelistRow>('pricelists', []);

  const scanStats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const recent = bonnen.filter((b) => (b.created_at || b.datum || '') >= monthStart);
    const total = recent.reduce((s, b) => s + (Number(b.bedrag) || 0), 0);
    return [
      { label: 'Deze maand', value: recent.length },
      { label: 'Totaal bedrag', value: fmt(total) },
    ];
  }, [bonnen]);

  const lastScan = useMemo(() => {
    if (bonnen.length === 0) return undefined;
    const sorted = [...bonnen].sort((a, b) => (b.created_at || b.datum || '').localeCompare(a.created_at || a.datum || ''));
    const d = sorted[0]?.created_at || sorted[0]?.datum;
    return d ? `Laatste: ${new Date(d).toLocaleDateString('nl-NL')}` : undefined;
  }, [bonnen]);

  const archiefStats = useMemo(() => {
    const byCat = new Map<string, number>();
    photos.forEach((p) => byCat.set(p.categorie || 'Overig', (byCat.get(p.categorie || 'Overig') || 0) + 1));
    return [
      { label: 'Items totaal', value: photos.length },
      { label: 'Categorieën', value: byCat.size },
    ];
  }, [photos]);

  const prijsStats = useMemo(() => {
    const leveranciers = new Set(pricelists.map((p) => p.leverancier).filter(Boolean));
    return [
      { label: 'Prijslijsten', value: pricelists.length },
      { label: 'Leveranciers', value: leveranciers.size },
    ];
  }, [pricelists]);

  return (
    <div className="main-content">
      <PageHeader
        title="Factuur-lezer"
        description="Bon of factuur binnen? Hier komt alles op één plek — scannen, archiveren, prijsanalyse."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          marginTop: 16,
        }}
      >
        <HubCard
          href="/inkoop"
          icon={ScanLine}
          title="Bon of factuur scannen"
          desc="Upload een PDF of foto van een Makro-bon, leveranciersfactuur of inkoopbon. AI extracteert de regels en koppelt aan voorraad."
          cta="Open scanner"
          stats={scanStats}
          recent={lastScan}
          loading={loadingBonnen}
        />
        <HubCard
          href="/foto-archief"
          icon={ImageIcon}
          title="Archief"
          desc="Alle gescande bonnen, facturen en foto's terugvinden — gefilterd op categorie, leverancier of event."
          cta="Open archief"
          stats={archiefStats}
          loading={loadingPhotos}
        />
        <HubCard
          href="/price-intelligence"
          icon={Receipt}
          title="Prijsanalyse"
          desc="Trends in inkoopprijzen per ingrediënt en leverancier — pak je dure pieken vroeg."
          cta="Open analyse"
          stats={prijsStats}
          loading={loadingPL}
        />
      </div>
    </div>
  );
}
