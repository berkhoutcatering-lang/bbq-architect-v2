'use client';

import { useMemo } from 'react';
import { BarChart3, Clock, Users, Package, ShoppingCart } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import HubCard from '@/components/HubCard';
import { useSupabase } from '@/lib/useSupabase';
import { fmt } from '@/lib/utils';

interface FactuurRow { id: number; status?: string; datum?: string; items?: Array<{ qty?: number; prijs?: number }> }
interface KlantRow { id: number; created_at?: string }
interface InventoryRow { id: number; current_stock?: number; min_stock?: number; purchase_price?: number }
interface TimeLogRow { id: number; start_time?: string; end_time?: string; minutes?: number }
interface InkoopRow { id: number; status?: string; created_at?: string }

const ANNUAL_HOURS_TARGET = 1225; // ZZP-uurnorm

export default function AdministratieHub() {
  const { data: facturen, loading: loadingFacturen } = useSupabase<FactuurRow>('facturen', []);
  const { data: klanten, loading: loadingKlanten } = useSupabase<KlantRow>('klanten', []);
  const { data: inventory, loading: loadingInv } = useSupabase<InventoryRow>('inventory', []);
  const { data: timeLogs, loading: loadingHours } = useSupabase<TimeLogRow>('time_logs', []);
  const { data: inkoop, loading: loadingInkoop } = useSupabase<InkoopRow>('inkooplijsten', []);

  const financienStats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const open = facturen.filter((f) => f.status && f.status !== 'betaald' && f.status !== 'geannuleerd');
    const openBedrag = open.reduce((s, f) => s + (f.items || []).reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.prijs) || 0), 0), 0);
    const betaaldThisMonth = facturen.filter((f) => f.status === 'betaald' && (f.datum || '') >= monthStart);
    const omzetThisMonth = betaaldThisMonth.reduce((s, f) => s + (f.items || []).reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.prijs) || 0), 0), 0);
    return [
      { label: 'Omzet deze maand', value: fmt(omzetThisMonth) },
      { label: 'Openstaand', value: fmt(openBedrag), accent: openBedrag > 0 ? ('warning' as const) : ('default' as const) },
    ];
  }, [facturen]);

  const urenStats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekIso = weekStart.toISOString();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

    const minutesThisWeek = timeLogs.reduce((s, t) => {
      if ((t.start_time || '') >= weekIso) return s + (Number(t.minutes) || 0);
      return s;
    }, 0);
    const minutesYTD = timeLogs.reduce((s, t) => {
      if ((t.start_time || '') >= yearStart) return s + (Number(t.minutes) || 0);
      return s;
    }, 0);
    const hoursWeek = Math.round((minutesThisWeek / 60) * 10) / 10;
    const hoursYTD = Math.round(minutesYTD / 60);
    const targetPct = Math.min(100, Math.round((hoursYTD / ANNUAL_HOURS_TARGET) * 100));
    return [
      { label: 'Deze week', value: `${hoursWeek}h` },
      { label: '1.225h-norm', value: `${targetPct}%`, accent: targetPct >= 100 ? ('success' as const) : ('default' as const) },
    ];
  }, [timeLogs]);

  const klantenStats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const newThisMonth = klanten.filter((k) => (k.created_at || '') >= monthStart);
    return [
      { label: 'Totaal', value: klanten.length },
      { label: 'Nieuw deze maand', value: newThisMonth.length },
    ];
  }, [klanten]);

  const voorraadStats = useMemo(() => {
    const lowStock = inventory.filter((i) => (i.current_stock || 0) < (i.min_stock || 0));
    const totaleWaarde = inventory.reduce((s, i) => s + (Number(i.current_stock) || 0) * (Number(i.purchase_price) || 0), 0);
    return [
      { label: 'Onder min.', value: lowStock.length, accent: lowStock.length > 0 ? ('danger' as const) : ('success' as const) },
      { label: 'Voorraadwaarde', value: fmt(totaleWaarde) },
    ];
  }, [inventory]);

  const inkoopStats = useMemo(() => {
    const open = inkoop.filter((i) => i.status && i.status !== 'voltooid' && i.status !== 'geannuleerd');
    return [
      { label: 'Open lijsten', value: open.length, accent: open.length > 0 ? ('warning' as const) : ('default' as const) },
      { label: 'Totaal', value: inkoop.length },
    ];
  }, [inkoop]);

  return (
    <div className="main-content">
      <PageHeader
        title="Administratie"
        description="Alles wat papierwerk is — financiën, uren, klanten, voorraad en inkoop op één plek."
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
          href="/financien"
          icon={BarChart3}
          title="Financiën"
          desc="Dashboard, winst & verlies, uitgaven, BTW en top-klanten."
          cta="Open financiën"
          stats={financienStats}
          loading={loadingFacturen}
        />
        <HubCard
          href="/uren"
          icon={Clock}
          title="Uren"
          desc="Urenregistratie van team-leden per event — start/stop en weekoverzicht."
          cta="Open uren"
          stats={urenStats}
          loading={loadingHours}
        />
        <HubCard
          href="/klanten"
          icon={Users}
          title="Klanten"
          desc="Klantenbestand en historie van eerdere events, offertes en facturen."
          cta="Open klanten"
          stats={klantenStats}
          loading={loadingKlanten}
        />
        <HubCard
          href="/voorraad"
          icon={Package}
          title="Voorraad"
          desc="Huidige voorraadstand, par-levels en reorder-warnings."
          cta="Open voorraad"
          stats={voorraadStats}
          loading={loadingInv}
        />
        <HubCard
          href="/inkoop"
          icon={ShoppingCart}
          title="Inkooplijsten"
          desc="Bestellijsten, leveranciers en open bestelling-statussen."
          cta="Open inkoop"
          stats={inkoopStats}
          loading={loadingInkoop}
        />
      </div>
    </div>
  );
}
