/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * InkoopOrderPdf — server-rendered bestellings-PDF
 * ───────────────────────────────────────────────
 * Gebruikt door sendOrderToSupplier (Server Action). Layout volgt de Claude
 * Design PDF preview-modal: logo links, ordernummer rechts, items-tabel,
 * subtotaal / BTW 9% / BTW 21% / totaal.
 *
 * BTW-split via inventory.categorie:
 *   - 'rookhout','hardware','keuken','schoonmaak' → 21%
 *   - alles anders → 9% (voedsel / drank-non-alc / kruiden)
 *
 * Bewust hardcoded mapping in plaats van AI-derived (memory-rule
 * bbq-implementation: never AI-derive BTW rates).
 */
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { OrderItemSnapshot } from '@/lib/dal/inkoopOrders';

const ROOKHOUT_OF_HARDWARE = /(rookhout|hout|aanmaak|hardware|gereedschap|servies|materieel|schoonmaak)/i;

export function determineBtwPct(categorie: string | null | undefined): 9 | 21 {
  if (!categorie) return 9;
  if (ROOKHOUT_OF_HARDWARE.test(categorie)) return 21;
  return 9;
}

export interface InkoopOrderPdfProps {
  ordernummer: string;
  datum: string;
  leverancier: { naam: string; email: string | null; adres?: string | null };
  afzender: {
    bedrijfsnaam: string;
    adres?: string | null;
    btw_nummer?: string | null;
    kvk_nummer?: string | null;
    logo_url?: string | null;
    brand_color?: string | null;
  };
  items: OrderItemSnapshot[];
  subtotaal_eur: number;
  btw_laag_eur: number;     // 9%
  btw_hoog_eur: number;     // 21%
  totaal_eur: number;
  notitie: string | null;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  brand: { fontSize: 18, fontWeight: 700, letterSpacing: 1 },
  brandSub: { fontSize: 9, color: '#666', marginTop: 2 },
  meta: { textAlign: 'right', fontSize: 9, color: '#666' },
  metaNumber: { fontSize: 11, fontWeight: 600, color: '#111', marginBottom: 2 },

  to: { fontSize: 10, fontWeight: 600, marginBottom: 4, color: '#111' },
  toLine: { fontSize: 9, color: '#666', lineHeight: 1.4 },
  divider: { height: 1, backgroundColor: '#dadada', marginVertical: 14 },

  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#222',
    paddingBottom: 6,
    marginBottom: 4,
  },
  th: { fontSize: 9, fontWeight: 700, color: '#111' },
  thQty: { fontSize: 9, fontWeight: 700, color: '#111', textAlign: 'right' },

  tr: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  td: { fontSize: 10 },
  tdRight: { fontSize: 10, textAlign: 'right' },
  tdEvents: { fontSize: 8, color: '#999', marginTop: 2 },

  totalsBox: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  totalsLabels: { width: 140, fontSize: 10, color: '#555' },
  totalsValues: { width: 80, fontSize: 10, textAlign: 'right' },
  totalLine: { fontWeight: 700, marginTop: 6, fontSize: 12, color: '#111' },

  noteBox: {
    marginTop: 28,
    padding: 12,
    backgroundColor: '#fafafa',
    border: '1px solid #eee',
    borderRadius: 4,
  },
  noteLabel: { fontSize: 9, fontWeight: 700, marginBottom: 4, color: '#555' },
  noteText: { fontSize: 10, color: '#333', lineHeight: 1.5 },

  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#dadada',
    fontSize: 8,
    color: '#888',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

function fmtEur(n: number): string {
  return '€ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
}

function fmtQty(n: number, unit: string): string {
  const v = Number(n) || 0;
  if (v >= 100) return Math.round(v) + ' ' + unit;
  if (v >= 10) return v.toFixed(1) + ' ' + unit;
  return v.toFixed(2) + ' ' + unit;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

export function InkoopOrderPdf(props: InkoopOrderPdfProps) {
  const {
    ordernummer, datum, leverancier, afzender,
    items, subtotaal_eur, btw_laag_eur, btw_hoog_eur, totaal_eur, notitie,
  } = props;

  const brand = afzender.brand_color || '#c4a35a';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {afzender.logo_url ? (
              <Image src={afzender.logo_url} style={{ height: 36, marginBottom: 6 }} />
            ) : null}
            <Text style={[styles.brand, { color: brand }]}>{afzender.bedrijfsnaam.toUpperCase()}</Text>
            {afzender.adres ? <Text style={styles.brandSub}>{afzender.adres}</Text> : null}
            {(afzender.btw_nummer || afzender.kvk_nummer) ? (
              <Text style={styles.brandSub}>
                {[afzender.btw_nummer ? 'BTW ' + afzender.btw_nummer : null,
                  afzender.kvk_nummer ? 'KvK ' + afzender.kvk_nummer : null].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.metaNumber}>Bestelling {ordernummer}</Text>
            <Text style={styles.meta}>{datum}</Text>
          </View>
        </View>

        <Text style={styles.to}>Aan: {leverancier.naam}</Text>
        <Text style={styles.toLine}>
          {[leverancier.email, leverancier.adres].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.divider} />

        {/* Items header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 3 }]}>Product</Text>
          <Text style={[styles.thQty, { flex: 1 }]}>Hoeveelheid</Text>
          <Text style={[styles.thQty, { flex: 1 }]}>Prijs/eenheid</Text>
          <Text style={[styles.thQty, { flex: 1 }]}>BTW</Text>
          <Text style={[styles.thQty, { flex: 1 }]}>Totaal</Text>
        </View>

        {items.map(function (it, idx) {
          return (
            <View key={idx} style={styles.tr} wrap={false}>
              <View style={{ flex: 3 }}>
                <Text style={styles.td}>{it.naam}</Text>
                {it.events.length > 0 ? (
                  <Text style={styles.tdEvents}>
                    {it.events.map(function (ev) { return fmtDate(ev.event_date) + ' · ' + ev.event_name; }).join(' · ')}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.tdRight, { flex: 1 }]}>{fmtQty(it.qty, it.unit)}</Text>
              <Text style={[styles.tdRight, { flex: 1 }]}>
                {it.unit_price_eur != null ? fmtEur(it.unit_price_eur) + '/' + it.unit : '—'}
              </Text>
              <Text style={[styles.tdRight, { flex: 1 }]}>{it.btw_pct}%</Text>
              <Text style={[styles.tdRight, { flex: 1, fontWeight: 700 }]}>{it.unit_price_eur != null ? fmtEur(it.line_total_eur) : 'n.t.b.'}</Text>
            </View>
          );
        })}

        {/* Totalen */}
        <View style={styles.totalsBox}>
          <View>
            <View style={{ flexDirection: 'row' }}>
              <Text style={styles.totalsLabels}>Subtotaal excl. BTW</Text>
              <Text style={styles.totalsValues}>{fmtEur(subtotaal_eur)}</Text>
            </View>
            {btw_laag_eur > 0 ? (
              <View style={{ flexDirection: 'row', marginTop: 2 }}>
                <Text style={styles.totalsLabels}>BTW 9% (voedsel)</Text>
                <Text style={styles.totalsValues}>{fmtEur(btw_laag_eur)}</Text>
              </View>
            ) : null}
            {btw_hoog_eur > 0 ? (
              <View style={{ flexDirection: 'row', marginTop: 2 }}>
                <Text style={styles.totalsLabels}>BTW 21% (non-food)</Text>
                <Text style={styles.totalsValues}>{fmtEur(btw_hoog_eur)}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', marginTop: 6, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 6 }}>
              <Text style={[styles.totalsLabels, styles.totalLine]}>Totaal incl. BTW</Text>
              <Text style={[styles.totalsValues, styles.totalLine]}>{fmtEur(totaal_eur)}</Text>
            </View>
          </View>
        </View>

        {notitie ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteLabel}>OPMERKING</Text>
            <Text style={styles.noteText}>{notitie}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>BBQ Architect — automatisch gegenereerd</Text>
          <Text render={function (p: any) { return p.pageNumber + ' / ' + p.totalPages; }} />
        </View>
      </Page>
    </Document>
  );
}
