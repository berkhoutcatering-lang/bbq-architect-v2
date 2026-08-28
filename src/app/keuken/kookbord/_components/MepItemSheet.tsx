'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { X, Flame, Check, RotateCcw, Circle, Thermometer, AlertTriangle, ListChecks, Package, Utensils, SquarePen, Save } from 'lucide-react';
import type { MepComponentItem, MepStatus } from './KookbordClient';
import { pal, formatQty, nextStatus, btnSpec, ACCENT_DARK } from './mep-ui';

interface MepItemSheetProps {
  open: boolean;
  item: MepComponentItem | null;
  guests: number;
  gerecht?: string;
  onClose: () => void;
  onStatusChange: (itemId: number, status: MepStatus) => void | Promise<void>;
  onSaveNotes?: (itemId: number, notes: string) => void | Promise<void>;
  savingNotes?: boolean;
}

function asStatus(v: string): MepStatus {
  return v === 'bezig' || v === 'klaar' ? v : 'todo';
}

function footLabel(s: MepStatus): string {
  return s === 'todo' ? 'Start voorbereiding' : s === 'bezig' ? 'Markeer klaar' : 'Zet terug';
}

const hdr: CSSProperties = { fontFamily: "var(--font-outfit), sans-serif", fontWeight: 500, fontSize: 16, letterSpacing: '.01em', color: '#f0f0f0', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 };

export default function MepItemSheet({ open, item, guests, gerecht, onClose, onStatusChange, onSaveNotes, savingNotes = false }: MepItemSheetProps) {
  const [note, setNote] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setNote(item?.notes ?? '');
    setJustSaved(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.mep_item_id, open]);

  if (!open || !item) return null;

  const status = asStatus(item.status);
  const p = pal(status);
  const q = formatQty(item.base_quantity, item.base_unit, guests);
  const isIngekocht = item.type === 'bought_in';
  const stappen = item.preparation_steps ?? [];
  const haccp = item.haccp_points ?? [];
  const allergenen = (item.allergens ?? []).map(a => a.allergen_code?.toUpperCase?.() ?? '').filter(Boolean);
  const tags = item.flavor_tags ?? [];
  const bs = btnSpec(status);
  const next = nextStatus(status);

  const TypeIcon = isIngekocht ? Package : Utensils;
  const PillIcon = status === 'bezig' ? Flame : status === 'klaar' ? Check : Circle;
  const FootIcon = status === 'todo' ? Flame : status === 'bezig' ? Check : RotateCcw;

  const itemId = item.mep_item_id;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(3px)', animation: 'mepFade .22s ease' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg,#161518,#0f0f11)', borderTop: '1px solid rgba(130,130,130,.18)', borderRadius: '20px 20px 0 0', boxShadow: '0 -24px 70px rgba(0,0,0,.6)', animation: 'mepUp .34s cubic-bezier(.16,1,.3,1)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px', flex: '0 0 auto' }}>
          <span style={{ width: 42, height: 4, borderRadius: 999, background: 'rgba(130,130,130,.3)' }} />
        </div>

        <div style={{ flex: '0 0 auto', padding: '14px 30px 18px', display: 'flex', alignItems: 'flex-start', gap: 16, borderBottom: '1px solid rgba(130,130,130,.1)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#83838a', marginBottom: 6 }}>
              <TypeIcon size={11} color="#83838a" strokeWidth={2} />
              <span>{isIngekocht ? 'Ingekocht' : 'Bereid'}</span>
              {gerecht ? <><span style={{ color: '#5a5a5e' }}>·</span><span style={{ color: '#83838a', letterSpacing: '.06em' }}>{gerecht}</span></> : null}
            </span>
            <h2 style={{ fontFamily: "var(--font-outfit), sans-serif", fontWeight: 500, fontSize: 27, letterSpacing: '-.015em', margin: 0, color: '#f6f6f6', lineHeight: 1.1 }}>{item.name}</h2>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 13px 0 11px', borderRadius: 999, background: p.pillBg, border: `1px solid ${p.pillBd}`, color: p.pillFg, fontSize: 12.5, fontWeight: 700, letterSpacing: '.02em', flex: '0 0 auto', whiteSpace: 'nowrap', marginTop: 4 }}>
            <PillIcon size={13} color={p.pillFg} strokeWidth={status === 'klaar' ? 2.4 : 2} {...(status === 'bezig' ? { fill: p.pillFg } : {})} />
            <span>{p.label}</span>
          </span>
          <button onClick={onClose} className="mep-ghost" style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(130,130,130,.08)', border: '1px solid rgba(130,130,130,.16)', color: '#b3b3b9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 auto' }}>
            <X size={18} color="#b3b3b9" strokeWidth={2.2} />
          </button>
        </div>

        <div className="mep-sc" style={{ flex: 1, overflowY: 'auto', padding: '24px 30px 22px' }}>
          <div style={{ maxWidth: 1060, margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 34, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 26 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: '#83838a' }}>Te maken</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-outfit), sans-serif", fontSize: 52, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 0.9, letterSpacing: '.01em', color: '#ffffff' }}>{q.value}</span>
                  <span style={{ fontFamily: "var(--font-outfit), sans-serif", fontSize: 22, fontWeight: 500, color: '#9aa0a8' }}>{q.unit}</span>
                </div>
              </div>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: '#83838a' }}>Smaakprofiel</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {tags.map(t => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 12px', borderRadius: 999, background: 'rgba(196,163,90,.1)', border: '1px solid rgba(196,163,90,.26)', color: '#d8c08a', fontSize: 12.5, fontWeight: 600 }}>{t}</span>)}
                  </div>
                </div>
              )}
            </div>

            <div className="mep-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 26 }}>
              <div>
                <h3 style={hdr}><ListChecks size={17} color="#d8c08a" strokeWidth={2} /><span>Bereidingswijze</span></h3>
                {stappen.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {stappen.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '11px 0', borderBottom: '1px solid rgba(130,130,130,.08)' }}>
                        <span style={{ flex: '0 0 auto', width: 28, height: 28, borderRadius: 9, background: 'rgba(196,163,90,.12)', border: '1px solid rgba(196,163,90,.28)', color: '#d8c08a', fontFamily: "var(--font-outfit), sans-serif", fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                        <span style={{ fontSize: 15, lineHeight: 1.55, color: '#dcdcdc', paddingTop: 2 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ fontSize: 14, color: '#7a7a7e', margin: 0 }}>Nog geen bereidingsstappen vastgelegd.</p>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {haccp.length > 0 && (
                  <div>
                    <h3 style={hdr}><Thermometer size={16} color="#7fe0a3" strokeWidth={2} /><span>HACCP</span></h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {haccp.map((h, i) => {
                        const drempel = h.threshold_value != null ? `${h.threshold_value}${h.threshold_unit ? ` ${h.threshold_unit}` : ''}` : (h.note ?? '');
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 14px', borderRadius: 11, background: 'rgba(34,197,94,.05)', border: '1px solid rgba(34,197,94,.16)', borderLeft: '3px solid rgba(34,197,94,.6)' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 500, color: '#cfd6cf' }}>{h.type}</span>
                            {drempel ? <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 13, fontWeight: 600, color: '#7fe0a3', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{drempel}</span> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <h3 style={hdr}><AlertTriangle size={16} color="#e9bd6e" strokeWidth={2} /><span>Allergenen</span></h3>
                  {allergenen.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {allergenen.map(code => (
                        <span key={code} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.26)', color: '#e9bd6e', fontSize: 12.5, fontWeight: 700, letterSpacing: '.05em' }}>
                          <AlertTriangle size={12} color="#e9bd6e" strokeWidth={2} /><span>{code}</span>
                        </span>
                      ))}
                    </div>
                  ) : <span style={{ fontSize: 14, color: '#7a7a7e' }}>Geen allergenen — veilig voor alle gasten.</span>}
                </div>

                <div>
                  <h3 style={hdr}><SquarePen size={16} color="#9aa0a8" strokeWidth={2} /><span>Notities</span></h3>
                  <textarea
                    value={note}
                    onChange={e => { setNote(e.target.value); setJustSaved(false); }}
                    placeholder="Bijv. extra rub op tafel 1 · kerntemp checken om 16:00…"
                    style={{ width: '100%', minHeight: 84, resize: 'vertical', padding: '12px 14px', borderRadius: 11, background: 'rgba(30,30,34,.6)', border: '1px solid rgba(130,130,130,.18)', color: '#e6e6e6', fontSize: 13.5, lineHeight: 1.5, outline: 'none', fontFamily: "var(--font-dm-sans), sans-serif" }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
                    <button
                      type="button"
                      onClick={() => { if (!onSaveNotes) return; void onSaveNotes(itemId, note); setJustSaved(true); window.setTimeout(() => setJustSaved(false), 2200); }}
                      disabled={!onSaveNotes || savingNotes}
                      className="mep-ghost"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 9, background: 'rgba(130,130,130,.08)', border: '1px solid rgba(130,130,130,.2)', color: '#cfcfcf', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: (!onSaveNotes || savingNotes) ? 0.6 : 1 }}
                    >
                      <Save size={13} color="#cfcfcf" strokeWidth={2} />
                      <span>{savingNotes ? 'Opslaan…' : 'Opslaan'}</span>
                    </button>
                    {justSaved && !savingNotes ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#74e29a', fontWeight: 600 }}>
                        <Check size={13} color="#74e29a" strokeWidth={2.6} /><span>Opgeslagen</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: '0 0 auto', padding: '15px 30px', borderTop: '1px solid rgba(130,130,130,.1)', display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(10,10,12,.7)' }}>
          <button
            type="button"
            onClick={() => void onStatusChange(itemId, next)}
            className="mep-cta"
            style={{ flex: 1, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 13, border: bs.border, background: bs.bg, color: bs.fg, boxShadow: bs.shadow, cursor: 'pointer', fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: '.01em' }}
          >
            <FootIcon size={status === 'bezig' ? 21 : status === 'todo' ? 20 : 19} color={bs.fg} strokeWidth={status === 'bezig' ? 2.6 : status === 'todo' ? 2.2 : 2.1} {...(status === 'todo' ? { fill: ACCENT_DARK } : {})} />
            <span>{footLabel(status)}</span>
          </button>
          <button type="button" onClick={onClose} className="mep-ghost" style={{ height: 56, padding: '0 22px', borderRadius: 13, background: 'rgba(130,130,130,.07)', border: '1px solid rgba(130,130,130,.18)', color: '#9aa0a8', fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: '0 0 auto' }}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}
