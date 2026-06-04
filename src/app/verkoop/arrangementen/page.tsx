'use client';

/* /verkoop/arrangementen — Cateraar-bouwer voor "Zelf offerte samenstellen".
   ─────────────────────────────────────────────────────────────────────────────
   De cateraar bouwt hier de inhoud achter de publieke configurator
   (/arrangement/[slug]): arrangement → categorieën → max 3 niveaus (items +
   indicatieprijs pp). Het systeem bezit de lay-out; de cateraar vult de slots.

   Reads via de RLS-scoped browser-client; writes via server actions (Zod +
   re-auth + org-scope). indicatieprijs is cateraar-config, nooit AI-afgeleid. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, X, ChevronUp, ChevronDown, Copy, Check,
  Loader2, Layers, Eye, Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { ConfigIcon, CONFIG_ICON_CHOICES } from '@/components/ConfigIcon';
import {
  createArrangement, updateArrangement, saveCategorie, deleteCategorie, reorderCategorie,
} from './actions';
import './arrangementen.css';

interface Niveau { id: string; naam: string; indicatie_prijs_pp: number; items: string[]; populair: boolean; volgorde: number; }
interface Categorie { id: string; naam: string; icon: string; hint: string | null; volgorde: number; niveaus: Niveau[]; }
interface Arrangement { id: string; naam: string; gasten_default: number; min_gasten: number; actief: boolean; publiek: boolean; volgorde: number; }

interface NiveauDraft { id?: string; naam: string; prijs: string; itemsText: string; populair: boolean; }
interface CatDraft { id?: string; naam: string; icon: string; hint: string; niveaus: NiveauDraft[]; }

const euro = (n: number) => '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const newNiveau = (naam = '', populair = false): NiveauDraft => ({ naam, prijs: '', itemsText: '', populair });

/* ── kleine switch ─────────────────────────────────────────────────────────── */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" className="arr-toggle-wrap" onClick={() => onChange(!checked)} aria-pressed={checked}>
      <span className={'arr-toggle' + (checked ? ' on' : '')}><span className="arr-toggle-knob" /></span>
      <span className="arr-toggle-label">{label}</span>
    </button>
  );
}

export default function ArrangementenPage() {
  const { orgId } = useOrg();
  const showToast = useToast();
  const showConfirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [arr, setArr] = useState<Arrangement | null>(null);
  const [cats, setCats] = useState<Categorie[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [funnel, setFunnel] = useState<{ view: number; start: number; submit: number } | null>(null);
  const [copied, setCopied] = useState(false);

  /* arrangement-instellingen (dirty-tracking) */
  const [head, setHead] = useState<{ naam: string; gasten_default: number; min_gasten: number; actief: boolean; publiek: boolean } | null>(null);
  const [savingHead, setSavingHead] = useState(false);

  /* drawer */
  const [drawer, setDrawer] = useState<CatDraft | null>(null);
  const [savingCat, setSavingCat] = useState(false);
  const [drawerErr, setDrawerErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !supabase) return;
    setLoading(true);
    const [{ data: arrs }, { data: org }] = await Promise.all([
      supabase.from('arrangementen').select('*').eq('organization_id', orgId).order('volgorde', { ascending: true }).limit(1),
      supabase.from('organizations').select('slug').eq('id', orgId).single(),
    ]);
    setSlug(org?.slug ?? null);
    const a = (arrs?.[0] as Arrangement | undefined) ?? null;
    setArr(a);
    setHead(a ? { naam: a.naam, gasten_default: a.gasten_default, min_gasten: a.min_gasten ?? 1, actief: a.actief, publiek: a.publiek } : null);
    if (a) {
      const { data: c } = await supabase.from('arrangement_categorieen').select('*').eq('arrangement_id', a.id).order('volgorde', { ascending: true });
      const catRows = (c ?? []) as Omit<Categorie, 'niveaus'>[];
      const ids = catRows.map((x) => x.id);
      const { data: n } = ids.length
        ? await supabase.from('categorie_niveaus').select('*').in('categorie_id', ids).order('volgorde', { ascending: true })
        : { data: [] };
      const byCat = new Map<string, Niveau[]>();
      for (const row of (n ?? []) as (Niveau & { categorie_id: string })[]) {
        const list = byCat.get(row.categorie_id) ?? [];
        list.push({ ...row, indicatie_prijs_pp: Number(row.indicatie_prijs_pp), items: Array.isArray(row.items) ? row.items : [] });
        byCat.set(row.categorie_id, list);
      }
      setCats(catRows.map((x) => ({ ...x, niveaus: byCat.get(x.id) ?? [] })));
      /* Trechter-tellingen (3 count-queries; head = geen rijen, alleen count). */
      const [v, s, sub] = await Promise.all((['view', 'start', 'submit'] as const).map((ev) =>
        supabase.from('funnel_events').select('id', { count: 'exact', head: true }).eq('arrangement_id', a.id).eq('event', ev),
      ));
      setFunnel({ view: v.count ?? 0, start: s.count ?? 0, submit: sub.count ?? 0 });
    } else {
      setCats([]);
      setFunnel(null);
    }
    setLoading(false);
  }, [orgId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standaard fetch-on-mount; load() setState gebeurt async na await
  useEffect(() => { load(); }, [load]);

  const headDirty = useMemo(() => {
    if (!arr || !head) return false;
    return head.naam !== arr.naam || head.gasten_default !== arr.gasten_default || head.min_gasten !== arr.min_gasten || head.actief !== arr.actief || head.publiek !== arr.publiek;
  }, [arr, head]);

  const publicUrl = slug ? `${typeof window !== 'undefined' ? window.location.origin : ''}/arrangement/${slug}` : '';

  async function doCreate(template: boolean) {
    setCreating(true);
    const res = await createArrangement({ template });
    setCreating(false);
    if ('error' in res) { showToast(res.error === 'validation' ? 'Controleer de invoer' : res.error, 'error'); return; }
    showToast(template ? 'Arrangement aangemaakt op basis van het voorbeeld' : 'Leeg arrangement aangemaakt', 'success');
    load();
  }

  async function saveHead() {
    if (!arr || !head) return;
    setSavingHead(true);
    const res = await updateArrangement({ id: arr.id, ...head });
    setSavingHead(false);
    if ('error' in res) { showToast(res.error === 'validation' ? 'Controleer de invoer' : res.error, 'error'); return; }
    showToast('Instellingen opgeslagen', 'success');
    load();
  }

  function openNew() {
    setDrawerErr(null);
    setDrawer({ naam: '', icon: 'utensils', hint: '', niveaus: [newNiveau('Simpel'), newNiveau('Medium', true), newNiveau('Best-of')] });
  }
  function openEdit(c: Categorie) {
    setDrawerErr(null);
    setDrawer({
      id: c.id, naam: c.naam, icon: c.icon || 'utensils', hint: c.hint || '',
      niveaus: c.niveaus.length
        ? c.niveaus.map((n) => ({ id: n.id, naam: n.naam, prijs: String(n.indicatie_prijs_pp).replace('.', ','), itemsText: n.items.join('\n'), populair: n.populair }))
        : [newNiveau('Simpel'), newNiveau('Medium', true), newNiveau('Best-of')],
    });
  }

  async function saveDrawer() {
    if (!arr || !drawer) return;
    if (!drawer.naam.trim()) { setDrawerErr('Geef de categorie een naam'); return; }
    const niveaus = drawer.niveaus
      .filter((n) => n.naam.trim())
      .map((n) => ({
        id: n.id,
        naam: n.naam.trim(),
        indicatie_prijs_pp: Number(String(n.prijs).replace(',', '.')) || 0,
        items: n.itemsText.split('\n').map((s) => s.trim()).filter(Boolean),
        populair: n.populair,
      }));
    if (!niveaus.length) { setDrawerErr('Voeg minstens één niveau toe'); return; }
    setSavingCat(true); setDrawerErr(null);
    const res = await saveCategorie({ id: drawer.id, arrangement_id: arr.id, naam: drawer.naam.trim(), icon: drawer.icon, hint: drawer.hint.trim(), niveaus });
    setSavingCat(false);
    if ('error' in res) { setDrawerErr(res.error === 'validation' ? 'Controleer de niveaus (naam + prijs)' : res.error); return; }
    showToast(drawer.id ? 'Categorie bijgewerkt' : 'Categorie toegevoegd', 'success');
    setDrawer(null); load();
  }

  async function removeCat(c: Categorie) {
    const ok = await showConfirm({ title: `"${c.naam}" verwijderen?`, description: 'De categorie en al z\'n niveaus worden verwijderd. Dit kan niet ongedaan worden.', confirmText: 'Verwijderen', danger: true });
    if (!ok) return;
    const res = await deleteCategorie({ id: c.id });
    if ('error' in res) { showToast(res.error, 'error'); return; }
    showToast('Categorie verwijderd', 'success'); load();
  }

  async function move(c: Categorie, direction: 'up' | 'down') {
    const res = await reorderCategorie({ id: c.id, direction });
    if ('error' in res) { showToast(res.error, 'error'); return; }
    load();
  }

  function copyLink() {
    if (!publicUrl || !navigator.clipboard) return;
    navigator.clipboard.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  }

  /* drawer-helpers */
  const setDraft = (patch: Partial<CatDraft>) => setDrawer((d) => (d ? { ...d, ...patch } : d));
  const setNiveau = (i: number, patch: Partial<NiveauDraft>) => setDrawer((d) => {
    if (!d) return d;
    const niveaus = d.niveaus.map((n, idx) => (idx === i ? { ...n, ...patch } : (patch.populair ? { ...n, populair: false } : n)));
    return { ...d, niveaus };
  });
  const addNiveau = () => setDrawer((d) => (d && d.niveaus.length < 3 ? { ...d, niveaus: [...d.niveaus, newNiveau()] } : d));
  const removeNiveau = (i: number) => setDrawer((d) => (d ? { ...d, niveaus: d.niveaus.filter((_, idx) => idx !== i) } : d));

  /* ── render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="arr-root">
      <div className="arr-wrap">
        <header className="arr-page-head">
          <div>
            <div className="arr-eyebrow">Zelf offerte samenstellen</div>
            <h1 className="arr-page-title">Arrangementen</h1>
            <p className="arr-page-sub">Bouw wat je klanten zelf kunnen samenstellen — categorieën met niveaus, items en een indicatieprijs per persoon.</p>
          </div>
        </header>

        {loading ? (
          <div className="arr-skel-wrap">
            <div className="arr-skel" style={{ height: 120 }} />
            <div className="arr-skel" style={{ height: 90 }} />
            <div className="arr-skel" style={{ height: 90 }} />
          </div>
        ) : !arr ? (
          <div className="arr-empty">
            <span className="arr-empty-ic"><Layers size={30} /></span>
            <h2 className="arr-empty-title">Nog geen arrangement</h2>
            <p className="arr-empty-lead">Maak een arrangement zodat klanten op je site zelf een offerte kunnen samenstellen en direct een indicatieprijs zien. Begin met een kant-en-klaar voorbeeld of vanaf nul.</p>
            <div className="arr-empty-actions">
              <button className="arr-btn arr-btn-primary" onClick={() => doCreate(true)} disabled={creating}>
                {creating ? <Loader2 size={17} className="arr-spin" /> : <Sparkles size={17} />} Begin met een voorbeeld
              </button>
              <button className="arr-btn arr-btn-ghost" onClick={() => doCreate(false)} disabled={creating}>Begin leeg</button>
            </div>
          </div>
        ) : (
          <>
            {/* Instellingen + publieke link */}
            <section className="arr-card arr-head-card">
              <div className="arr-head-top">
                <label className="arr-title-field">
                  <span className="arr-field-label">Naam van het arrangement</span>
                  <input className="arr-input arr-title-input" value={head?.naam ?? ''} onChange={(e) => setHead((h) => h && { ...h, naam: e.target.value })} placeholder="bijv. BBQ Arrangement" />
                </label>
                <div className="arr-head-toggles">
                  <Toggle label="Actief" checked={!!head?.actief} onChange={(v) => setHead((h) => h && { ...h, actief: v })} />
                  <Toggle label="Publiek" checked={!!head?.publiek} onChange={(v) => setHead((h) => h && { ...h, publiek: v })} />
                </div>
              </div>

              <div className="arr-head-row">
                <label className="arr-field">
                  <span className="arr-field-label">Standaard aantal gasten</span>
                  <input className="arr-input arr-num" type="number" min={1} value={head?.gasten_default || ''}
                    onChange={(e) => setHead((h) => h && { ...h, gasten_default: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                    onBlur={() => setHead((h) => h && { ...h, gasten_default: h.gasten_default < 1 ? 1 : h.gasten_default })} />
                </label>
                <label className="arr-field">
                  <span className="arr-field-label">Minimum aantal gasten</span>
                  <input className="arr-input arr-num" type="number" min={1} value={head?.min_gasten || ''}
                    onChange={(e) => setHead((h) => h && { ...h, min_gasten: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                    onBlur={() => setHead((h) => h && { ...h, min_gasten: h.min_gasten < 1 ? 1 : h.min_gasten })} />
                </label>
                <div className="arr-field arr-field-grow">
                  <span className="arr-field-label">Publieke link</span>
                  <div className="arr-link">
                    <span className="arr-link-url" title={publicUrl}>{slug ? `/arrangement/${slug}` : '—'}</span>
                    <div className="arr-link-actions">
                      <button className="arr-icon-btn" onClick={copyLink} title="Kopieer link" disabled={!slug}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
                      <a className="arr-icon-btn" href={publicUrl || '#'} target="_blank" rel="noopener noreferrer" title="Open de configurator" aria-disabled={!slug}><Eye size={15} /></a>
                    </div>
                  </div>
                </div>
              </div>

              {headDirty && (
                <div className="arr-save-bar">
                  <span>Niet-opgeslagen wijzigingen</span>
                  <button className="arr-btn arr-btn-primary arr-btn-sm" onClick={saveHead} disabled={savingHead}>
                    {savingHead ? <Loader2 size={15} className="arr-spin" /> : <Check size={15} />} Opslaan
                  </button>
                </div>
              )}
            </section>

            {funnel && (
              <section className="arr-card arr-funnel">
                <div className="arr-funnel-top">
                  <span className="arr-funnel-label">Trechter</span>
                  <span className="arr-funnel-conv">{funnel.view > 0 ? Math.round((funnel.submit / funnel.view) * 100) : 0}% conversie</span>
                </div>
                <div className="arr-funnel-row">
                  <div className="arr-funnel-step"><b>{funnel.view}</b><span>Bekeken</span></div>
                  <span className="arr-funnel-arrow">→</span>
                  <div className="arr-funnel-step"><b>{funnel.start}</b><span>Gestart</span></div>
                  <span className="arr-funnel-arrow">→</span>
                  <div className="arr-funnel-step accent"><b>{funnel.submit}</b><span>Aangevraagd</span></div>
                </div>
                {funnel.view === 0 && <div className="arr-funnel-hint">Nog geen bezoekers — deel je publieke link om de trechter te vullen.</div>}
              </section>
            )}

            {/* Categorieën */}
            <div className="arr-section-head">
              <h2 className="arr-section-title">Categorieën <span>{cats.length}</span></h2>
              <button className="arr-btn arr-btn-primary arr-btn-sm" onClick={openNew}><Plus size={16} /> Categorie toevoegen</button>
            </div>

            {cats.length === 0 ? (
              <div className="arr-card arr-cats-empty">Nog geen categorieën. Voeg er één toe — bijvoorbeeld Borrelhapjes, Hoofdgerecht of Dranken.</div>
            ) : (
              <div className="arr-cats">
                {cats.map((c, i) => (
                  <div className="arr-card arr-cat" key={c.id}>
                    <div className="arr-cat-head">
                      <span className="arr-cat-ic"><ConfigIcon name={c.icon} size={20} /></span>
                      <div className="arr-cat-meta">
                        <b>{c.naam}</b>
                        {c.hint && <span>{c.hint}</span>}
                      </div>
                      <div className="arr-cat-actions">
                        <button className="arr-cat-act" onClick={() => move(c, 'up')} disabled={i === 0} title="Omhoog"><ChevronUp size={16} /></button>
                        <button className="arr-cat-act" onClick={() => move(c, 'down')} disabled={i === cats.length - 1} title="Omlaag"><ChevronDown size={16} /></button>
                        <button className="arr-cat-act" onClick={() => openEdit(c)} title="Bewerken"><Pencil size={15} /></button>
                        <button className="arr-cat-act arr-danger" onClick={() => removeCat(c)} title="Verwijderen"><Trash2 size={15} /></button>
                      </div>
                    </div>
                    <div className="arr-niveaus">
                      {c.niveaus.length === 0 && <span className="arr-niv-empty">Geen niveaus — klik bewerken om ze toe te voegen.</span>}
                      {c.niveaus.map((n) => (
                        <div className="arr-niv" key={n.id}>
                          <span className="arr-niv-name">{n.naam}{n.populair && <span className="arr-niv-pop">Populairst</span>}</span>
                          <span className="arr-niv-price">{euro(n.indicatie_prijs_pp)} <small>p.p.</small></span>
                          <span className="arr-niv-items">{n.items.length} {n.items.length === 1 ? 'item' : 'items'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Drawer: categorie + niveaus ── */}
      {drawer && (
        <div className="arr-drawer-scrim" onClick={() => !savingCat && setDrawer(null)}>
          <div className="arr-drawer-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header className="arr-drawer-head">
              <h3>{drawer.id ? 'Categorie bewerken' : 'Nieuwe categorie'}</h3>
              <button className="arr-icon-btn" onClick={() => setDrawer(null)} aria-label="Sluiten"><X size={18} /></button>
            </header>
            <div className="arr-drawer-body">
              <label className="arr-field">
                <span className="arr-field-label">Naam <i>*</i></span>
                <input className="arr-input" value={drawer.naam} onChange={(e) => setDraft({ naam: e.target.value })} placeholder="bijv. Borrelhapjes" autoFocus />
              </label>

              <div className="arr-field">
                <span className="arr-field-label">Icoon</span>
                <div className="arr-iconpick">
                  {CONFIG_ICON_CHOICES.map((name) => (
                    <button key={name} type="button" className={'arr-iconpick-btn' + (drawer.icon === name ? ' on' : '')} onClick={() => setDraft({ icon: name })} title={name}>
                      <ConfigIcon name={name} size={19} />
                    </button>
                  ))}
                </div>
              </div>

              <label className="arr-field">
                <span className="arr-field-label">Korte uitleg <i className="arr-opt">optioneel</i></span>
                <input className="arr-input" value={drawer.hint} onChange={(e) => setDraft({ hint: e.target.value })} placeholder="bijv. Voor de ontvangst, terwijl de smoker opwarmt." />
              </label>

              <div className="arr-niv-edit-head">
                <span className="arr-field-label">Niveaus <i className="arr-opt">max 3 · middelste = populairst</i></span>
              </div>

              {drawer.niveaus.map((n, i) => (
                <div className="arr-niv-edit" key={i}>
                  <div className="arr-niv-edit-top">
                    <input className="arr-input arr-niv-naam" value={n.naam} onChange={(e) => setNiveau(i, { naam: e.target.value })} placeholder={`Niveau ${i + 1}`} />
                    <div className="arr-price-input">
                      <span>€</span>
                      <input className="arr-input" inputMode="decimal" value={n.prijs} onChange={(e) => setNiveau(i, { prijs: e.target.value })} placeholder="0,00" />
                      <small>p.p.</small>
                    </div>
                    {drawer.niveaus.length > 1 && (
                      <button className="arr-icon-btn arr-danger" onClick={() => removeNiveau(i)} title="Niveau verwijderen"><Trash2 size={15} /></button>
                    )}
                  </div>
                  <textarea className="arr-input arr-niv-items-input" rows={3} value={n.itemsText} onChange={(e) => setNiveau(i, { itemsText: e.target.value })}
                    placeholder="Eén item per regel, bv.&#10;5× frisdrank, 1 pils&#10;Huiswijn & tapbier (3 uur)" />
                  <label className="arr-pop-radio">
                    <input type="radio" name="populair" checked={n.populair} onChange={() => setNiveau(i, { populair: true })} />
                    <span>Markeer als populairst</span>
                  </label>
                </div>
              ))}

              {drawer.niveaus.length < 3 && (
                <button className="arr-add-niv" onClick={addNiveau}><Plus size={15} /> Niveau toevoegen</button>
              )}

              {drawerErr && <div className="arr-drawer-err">{drawerErr}</div>}
            </div>
            <footer className="arr-drawer-foot">
              <button className="arr-btn arr-btn-ghost" onClick={() => setDrawer(null)} disabled={savingCat}>Annuleren</button>
              <button className="arr-btn arr-btn-primary" onClick={saveDrawer} disabled={savingCat}>
                {savingCat ? <Loader2 size={16} className="arr-spin" /> : <Check size={16} />} Opslaan
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
