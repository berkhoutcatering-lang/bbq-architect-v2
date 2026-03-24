'use client';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ── Gang-configuratie ───────────────────────────────────────────────────────
var GANGEN = [
  { slug: 'bite', label: 'Bites', icon: '🍢', kleur: '#a78bfa' },
  { slug: 'voorgerecht', label: 'Voorgerechten', icon: '🥗', kleur: '#60a5fa' },
  { slug: 'hoofdgerecht', label: 'Hoofdgerechten', icon: '🥩', kleur: '#f97316' },
  { slug: 'vegetarisch', label: 'Vegetarisch', icon: '🌿', kleur: '#4ade80' },
  { slug: 'dessert', label: 'Desserts', icon: '🍮', kleur: '#f472b6' },
  { slug: 'bijgerecht', label: 'Bijgerechten', icon: '🫙', kleur: '#94a3b8' },
  { slug: 'borrelhap', label: 'Borrelhapjes', icon: '🧀', kleur: '#fbbf24' },
  { slug: 'anders', label: 'Overig', icon: '📦', kleur: '#6b7280' },
];

function getGang(slug) {
  return GANGEN.find(function (g) { return g.slug === slug; }) || GANGEN[GANGEN.length - 1];
}

// ── Score kleuren (subtiel, geen felle pills) ───────────────────────────────
function scoreColor(pct) {
  if (pct >= 75) return '#4ade80';
  if (pct >= 55) return '#fbbf24';
  return '#f87171';
}

// ── Gerecht Kaart ───────────────────────────────────────────────────────────
function GerechtKaart({ gerecht, onMoveToMap, geselecteerd, onViewDetails }) {
  var gang = getGang(gerecht.gang_slug);
  var marge = gerecht.kostprijs_pp
    ? Math.round((1 - gerecht.kostprijs_pp / 45) * 100)
    : null;

  return (
    <div
      onClick={function () { if (onViewDetails) onViewDetails(gerecht); }}
      style={{
        background: geselecteerd ? 'rgba(167,139,250,.05)' : 'var(--card)',
        border: geselecteerd ? '1px solid rgba(167,139,250,.25)' : '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px',
        transition: 'all .15s',
        position: 'relative',
        cursor: 'pointer' /* Made clickable */
      }}
      onMouseEnter={function (e) { e.currentTarget.style.borderColor = 'rgba(255,255,255,.2)'; }}
      onMouseLeave={function (e) { e.currentTarget.style.borderColor = geselecteerd ? 'rgba(167,139,250,.25)' : 'var(--border)'; }}
    >
      {/* Gang badge — subtiel */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: gang.kleur, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {gang.icon} {gang.label}
        </span>
        {gerecht.actief && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,.1)', padding: '1px 6px', borderRadius: 4 }}>actief</span>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4, lineHeight: 1.3 }}>{gerecht.naam}</div>
      {gerecht.beschrijving && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', lineHeight: 1.45, marginBottom: 10 }}>
          {gerecht.beschrijving.slice(0, 80)}{gerecht.beschrijving.length > 80 ? '…' : ''}
        </div>
      )}

      {/* Kostprijs + marge */}
      {gerecht.kostprijs_pp > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>
            <span>kostprijs p.p.</span>
            <span style={{ color: marge ? scoreColor(marge) : 'rgba(255,255,255,.5)', fontWeight: 700 }}>
              {marge ? marge + '% marge' : '—'}
            </span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: (marge || 0) + '%', background: scoreColor(marge || 0), borderRadius: 2, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>€{Number(gerecht.kostprijs_pp).toFixed(2)} / persoon</div>
        </div>
      )}

      {/* Tags */}
      {gerecht.tags && gerecht.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {gerecht.tags.slice(0, 3).map(function (tag) {
            return (
              <span key={tag} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.08)' }}>
                {tag}
              </span>
            );
          })}
        </div>
      )}

      {/* Map knop */}
      <button
        onClick={function (e) { e.stopPropagation(); onMoveToMap(gerecht); }}
        style={{
          width: '100%', background: 'rgba(167,139,250,.08)', border: '1px solid rgba(167,139,250,.15)',
          color: '#a78bfa', padding: '6px', borderRadius: 7, fontSize: 11, fontWeight: 600,
          cursor: 'pointer', transition: 'all .15s', marginTop: 4
        }}
        onMouseEnter={function (e) { e.target.style.background = 'rgba(167,139,250,.16)'; }}
        onMouseLeave={function (e) { e.target.style.background = 'rgba(167,139,250,.08)'; }}
      >
        → Zet in map
      </button>
    </div>
  );
}

// ── Gerecht Details / Edit Modal ────────────────────────────────────────────
function GerechtDetailsModal({ gerecht, onSave, onDelete, onClose, supabase }) {
  if (!gerecht) return null;

  function normalizeIngs(val) {
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return stringifyArray(val);
    return '';
  }

  function stringifyArray(arr) {
    if (!Array.isArray(arr)) return typeof arr === 'string' ? arr : '';
    return arr.map(function (i) {
      if (typeof i === 'object' && i !== null) return (i.hoeveelheid ? i.hoeveelheid + (i.eenheid ? ' ' + i.eenheid + ' ' : ' ') : '') + (i.naam || JSON.stringify(i));
      return i;
    }).join(', ');
  }

  var [form, setForm] = useState({
    naam: gerecht.naam || '',
    beschrijving: gerecht.beschrijving || '',
    ingredienten: normalizeIngs(gerecht.ingredients_list || gerecht.ingredienten),
    bereidingswijze: gerecht.preparation_steps || gerecht.bereidingswijze || '',
    allergenen: stringifyArray(gerecht.allergenen),
    kostprijs_pp: gerecht.kostprijs_pp || '',
  });
  var [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    var updateData = {
      naam: form.naam,
      beschrijving: form.beschrijving,
      ingredients_list: form.ingredienten,
      preparation_steps: form.bereidingswijze,
      allergenen: form.allergenen.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      kostprijs_pp: parseFloat(form.kostprijs_pp) || 0,
    };
    var { error } = await supabase.from('gerechten').update(updateData).eq('id', gerecht.id);
    setSaving(false);
    if (!error) onSave(gerecht.id, updateData);
    else alert('Fout bij opslaan: ' + error.message);
  }

  async function handleDelete() {
    if (!confirm('Let op: weet je zeker dat je dit gerecht permanent wilt verwijderen?')) return;
    setSaving(true);
    var { error } = await supabase.from('gerechten').delete().eq('id', gerecht.id);
    setSaving(false);
    if (!error) onDelete(gerecht.id);
    else alert('Fout bij verwijderen: ' + error.message);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 28px', width: 600, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={function (e) { e.stopPropagation(); }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: 'var(--brand)' }}>{gerecht.naam} Bewerken</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Naam</label>
            <input value={form.naam} onChange={function (e) { setForm(Object.assign({}, form, { naam: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Beschrijving (Smaakprofiel)</label>
            <textarea rows={2} value={form.beschrijving} onChange={function (e) { setForm(Object.assign({}, form, { beschrijving: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Ingrediënten (komma-gescheiden)</label>
            <textarea rows={2} value={form.ingredienten} onChange={function (e) { setForm(Object.assign({}, form, { ingredienten: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#B48C14', textTransform: 'uppercase', marginBottom: 4 }}>Allergenen (volgens warenwet, komma-gescheiden)</label>
            <input value={form.allergenen} onChange={function (e) { setForm(Object.assign({}, form, { allergenen: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'rgba(180,140,20,.1)', border: '1px solid rgba(180,140,20,.3)', borderRadius: 8, color: '#fff', fontSize: 13 }} placeholder="bijv. Gluten, Melk, Noten" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Bereidingswijze (Stappenplan)</label>
            <textarea rows={5} value={form.bereidingswijze} onChange={function (e) { setForm(Object.assign({}, form, { bereidingswijze: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 4 }}>Foodcost p.p. (€)</label>
            <input type="number" step="0.01" value={form.kostprijs_pp} onChange={function (e) { setForm(Object.assign({}, form, { kostprijs_pp: e.target.value })); }} style={{ width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 13 }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <button onClick={handleDelete} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,.1)', color: '#ef4444', fontWeight: 600, cursor: 'pointer', transition: '0.2s' }} onMouseEnter={function (e) { e.currentTarget.style.background = 'rgba(239,68,68,.2)'; }} onMouseLeave={function (e) { e.currentTarget.style.background = 'rgba(239,68,68,.1)'; }}>
            <i className="fa-solid fa-trash"></i> Verwijderen
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(255,255,255,.5)', fontWeight: 600, cursor: 'pointer' }}>Annuleren</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#000', fontWeight: 800, cursor: 'pointer' }}>
              {saving ? 'Laden...' : 'Wijzigingen Opslaan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Map Station Kaart ───────────────────────────────────────────────────────
function MapStation({ gang, gerechten, onRemove, onPublish }) {
  var kleur = gang.kleur;
  var isEmpty = gerechten.length === 0;

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderTop: '2px solid ' + kleur,
      borderRadius: 12,
      padding: '14px',
      minHeight: 120,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{gang.icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{gang.label}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{gerechten.length} gerecht{gerechten.length !== 1 ? 'en' : ''}</div>
        </div>
        {gerechten.length > 0 && (
          <button
            onClick={function () { onPublish(gang, gerechten); }}
            style={{
              marginLeft: 'auto', background: kleur + '18', border: '1px solid ' + kleur + '40',
              color: kleur, padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer'
            }}
          >
            Publiceer {gerechten.length} →
          </button>
        )}
      </div>

      {isEmpty ? (
        <div style={{
          border: '1px dashed rgba(255,255,255,.1)', borderRadius: 8, padding: '16px 10px',
          textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.2)'
        }}>
          Sleep of klik "→ Zet in map"
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {gerechten.map(function (g) {
            return (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', background: 'rgba(255,255,255,.04)',
                borderRadius: 7, fontSize: 12
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.naam}</span>
                {g.kostprijs_pp > 0 && (
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', flexShrink: 0 }}>€{Number(g.kostprijs_pp).toFixed(2)}</span>
                )}
                <button
                  onClick={function () { onRemove(g.id); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.25)', cursor: 'pointer', fontSize: 13, padding: '0 2px', flexShrink: 0 }}
                  title="Uit map verwijderen"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Gang Picker Modal ────────────────────────────────────────────────────────
function GangPickerModal({ gerecht, onPick, onClose }) {
  if (!gerecht) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div
        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 360, maxWidth: '90vw' }}
        onClick={function (e) { e.stopPropagation(); }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
          Zet <span style={{ color: 'var(--brand)' }}>{gerecht.naam}</span> in:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {GANGEN.map(function (g) {
            return (
              <button
                key={g.slug}
                onClick={function () { onPick(gerecht, g.slug); }}
                style={{
                  background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '10px', cursor: 'pointer',
                  textAlign: 'left', transition: 'border-color .15s',
                  display: 'flex', alignItems: 'center', gap: 8
                }}
                onMouseEnter={function (e) { e.currentTarget.style.borderColor = g.kleur + '60'; }}
                onMouseLeave={function (e) { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <span style={{ fontSize: 18 }}>{g.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: g.kleur }}>{g.label}</div>
                </div>
              </button>
            );
          })}
        </div>
        <button onClick={onClose} style={{ marginTop: 14, width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 12 }}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

// ── Hoofd component ─────────────────────────────────────────────────────────
export default function MenuEngineering() {
  var [gerechten, setGerechten] = useState([]);
  var [gangen, setGangen] = useState([]);
  var [loading, setLoading] = useState(true);
  var [search, setSearch] = useState('');
  var [gangFilter, setGangFilter] = useState('alle');
  var [view, setView] = useState('kaarten'); // 'kaarten' | 'map'

  // Map Station: { [gang_slug]: [gerecht, ...] }
  var [mapData, setMapData] = useState({});

  // Gang picker modal
  var [picking, setPicking] = useState(null); // gerecht object

  // Gerecht details modal
  var [viewingGerecht, setViewingGerecht] = useState(null);

  // Publish toast
  var [toast, setToast] = useState(null);

  // ── Data laden ─────────────────────────────────────────────────────────
  useEffect(function () {
    if (!supabase) { setLoading(false); return; }
    Promise.all([
      supabase.from('gangen').select('*').order('volgorde'),
      supabase.from('gerechten').select('id,naam,gang_slug,beschrijving,tags,allergenen,kostprijs_pp,actief').order('volgorde'),
    ]).then(function (results) {
      var gangenData = results[0].data || [];
      var gerechtenData = results[1].data || [];

      // Zet bekende gangen ook in GANGEN (aanvullen met DB data)
      setGangen(gangenData);

      // Bouw initiële map vanuit bestaande gang_slug
      var initMap = {};
      GANGEN.forEach(function (g) { initMap[g.slug] = []; });
      setMapData(initMap);

      setGerechten(gerechtenData);
      setLoading(false);
    });
  }, []);

  // ── Filtering ──────────────────────────────────────────────────────────
  var filtered = useMemo(function () {
    var q = search.toLowerCase();
    return gerechten.filter(function (g) {
      if (gangFilter !== 'alle' && g.gang_slug !== gangFilter) return false;
      if (q && !g.naam.toLowerCase().includes(q) && !(g.beschrijving || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [gerechten, gangFilter, search]);

  // Gerechten die nog NIET in de map zitten
  var inMap = useMemo(function () {
    var ids = new Set();
    Object.values(mapData).forEach(function (lijst) {
      lijst.forEach(function (g) { ids.add(g.id); });
    });
    return ids;
  }, [mapData]);

  var ongemapt = useMemo(function () {
    return filtered.filter(function (g) { return !inMap.has(g.id); });
  }, [filtered, inMap]);

  // ── Map acties ─────────────────────────────────────────────────────────
  function openGangPicker(gerecht) {
    setPicking(gerecht);
  }

  function placeInMap(gerecht, gangSlug) {
    setPicking(null);
    setMapData(function (prev) {
      var next = Object.assign({}, prev);
      // Verwijder uit andere mappen
      Object.keys(next).forEach(function (slug) {
        next[slug] = next[slug].filter(function (g) { return g.id !== gerecht.id; });
      });
      // Voeg toe aan juiste map
      if (!next[gangSlug]) next[gangSlug] = [];
      next[gangSlug] = next[gangSlug].concat([gerecht]);
      return next;
    });
  }

  function removeFromMap(gerechthId) {
    setMapData(function (prev) {
      var next = Object.assign({}, prev);
      Object.keys(next).forEach(function (slug) {
        next[slug] = next[slug].filter(function (g) { return g.id !== gerechthId; });
      });
      return next;
    });
  }

  // AI auto-sort: verplaats gerechten naar map op basis van huidige gang_slug
  function aiAutoSort() {
    var next = {};
    GANGEN.forEach(function (g) { next[g.slug] = []; });
    gerechten.forEach(function (g) {
      var slug = g.gang_slug || 'anders';
      if (!next[slug]) next[slug] = [];
      next[slug].push(g);
    });
    setMapData(next);
    showToast('✨ AI heeft ' + gerechten.length + ' gerechten gesorteerd op gang');
  }

  // Publiceer: update gang_slug in Supabase + zet actief: true
  async function publishGang(gang, gerechtenLijst) {
    if (!supabase || gerechtenLijst.length === 0) return;
    var ids = gerechtenLijst.map(function (g) { return g.id; });

    var { error } = await supabase.from('gerechten').update({ gang_slug: gang.slug, actief: true }).in('id', ids);
    if (error) {
      showToast('❌ Fout bij publiceren: ' + error.message);
      return;
    }
    // Update lokale state
    setGerechten(function (prev) {
      return prev.map(function (g) {
        if (ids.includes(g.id)) return Object.assign({}, g, { gang_slug: gang.slug, actief: true });
        return g;
      });
    });
    showToast('✅ ' + gerechtenLijst.length + ' gerechten gepubliceerd als ' + gang.label);
  }

  function handleSaveDetails(id, updateData) {
    setGerechten(function (prev) {
      return prev.map(function (g) {
        if (g.id === id) return Object.assign({}, g, updateData);
        return g;
      });
    });
    setViewingGerecht(null);
    showToast('✅ Gerecht succcesvol gewijzigd!');
  }

  function handleDeleteDetails(id) {
    setGerechten(function (prev) { return prev.filter(function (g) { return g.id !== id; }); });
    setViewingGerecht(null);
    showToast('❌ Gerecht verwijderd!');
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(function () { setToast(null); }, 3500);
  }

  // Map gerechten per gang
  var alleMapGerechten = useMemo(function () {
    var count = 0;
    Object.values(mapData).forEach(function (l) { count += l.length; });
    return count;
  }, [mapData]);

  // Statistieken
  var stats = useMemo(function () {
    var metKostprijs = gerechten.filter(function (g) { return g.kostprijs_pp > 0; });
    var gemMarge = metKostprijs.length > 0
      ? metKostprijs.reduce(function (s, g) { return s + (1 - g.kostprijs_pp / 45); }, 0) / metKostprijs.length * 100
      : 0;
    return {
      totaal: gerechten.length,
      actief: gerechten.filter(function (g) { return g.actief; }).length,
      gemMarge: gemMarge.toFixed(0),
      metKostprijs: metKostprijs.length,
    };
  }, [gerechten]);

  // ── Bekende gangen voor filter ─────────────────────────────────────────
  var gangOptions = useMemo(function () {
    var slugs = Array.from(new Set(gerechten.map(function (g) { return g.gang_slug; }).filter(Boolean)));
    var result = GANGEN.filter(function (g) { return slugs.includes(g.slug); });
    return result;
  }, [gerechten]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,.4)', fontSize: 14 }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Menu laden...
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 40 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,.5)', whiteSpace: 'nowrap'
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Menu Engineering</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>Beoordeel, sorteer en publiceer je gerechten via het Map Station</p>
      </div>

      {/* KPI balk */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Totaal', value: stats.totaal, sub: 'gerechten' },
          { label: 'Actief', value: stats.actief, sub: 'gepubliceerd' },
          { label: 'Met kostprijs', value: stats.metKostprijs, sub: 'berekend' },
          { label: 'Gem. marge', value: stats.gemMarge + '%', sub: 'op €45 menu' },
        ].map(function (s) {
          return (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 2 }}>{s.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Zoeken */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.3)', fontSize: 12 }} />
          <input
            type="text"
            value={search}
            onChange={function (e) { setSearch(e.target.value); }}
            placeholder="Zoek gerechten..."
            style={{
              width: '100%', paddingLeft: 34, padding: '9px 12px 9px 34px',
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none'
            }}
          />
        </div>

        {/* Gang filter pills */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button
            onClick={function () { setGangFilter('alle'); }}
            style={{ padding: '7px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: gangFilter === 'alle' ? 'rgba(255,255,255,.12)' : 'transparent', color: gangFilter === 'alle' ? '#fff' : 'rgba(255,255,255,.5)' }}
          >
            Alle
          </button>
          {gangOptions.map(function (g) {
            var active = gangFilter === g.slug;
            return (
              <button
                key={g.slug}
                onClick={function () { setGangFilter(active ? 'alle' : g.slug); }}
                style={{ padding: '7px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (active ? g.kleur + '50' : 'var(--border)'), background: active ? g.kleur + '14' : 'transparent', color: active ? g.kleur : 'rgba(255,255,255,.5)' }}
              >
                {g.icon} {g.label}
              </button>
            );
          })}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: 3, gap: 2 }}>
          {[['kaarten', '⊞ Kaarten'], ['map', '🗂 Map Station']].map(function (pair) {
            var isActive = view === pair[0];
            return (
              <button
                key={pair[0]}
                onClick={function () { setView(pair[0]); }}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: isActive ? 'rgba(255,255,255,.12)' : 'transparent', color: isActive ? '#fff' : 'rgba(255,255,255,.45)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {pair[1]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── KAARTEN VIEW ──────────────────────────────────────────── */}
      {view === 'kaarten' && (
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 14 }}>
            {filtered.length} gerechten
            {inMap.size > 0 && <span style={{ marginLeft: 8 }}>• <span style={{ color: '#a78bfa' }}>{inMap.size} in Map Station</span></span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {filtered.map(function (g) {
              return (
                <GerechtKaart
                  key={g.id}
                  gerecht={g}
                  geselecteerd={inMap.has(g.id)}
                  onMoveToMap={openGangPicker}
                  onViewDetails={setViewingGerecht}
                />
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,.25)', fontSize: 14 }}>
              Geen gerechten gevonden
            </div>
          )}
        </div>
      )}

      {/* ── MAP STATION VIEW ───────────────────────────────────────── */}
      {view === 'map' && (
        <div>
          {/* Map Station header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>🗂 Map Station</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
                {alleMapGerechten} gerechten ingedeeld • {gerechten.length - alleMapGerechten} nog niet
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                onClick={aiAutoSort}
                style={{ background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.2)', color: '#a78bfa', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                ✨ AI auto-sort
              </button>
              <button
                onClick={function () { setMapData({}); GANGEN.forEach(function (g) { setMapData(function (p) { return Object.assign({}, p, { [g.slug]: [] }); }); }); }}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'rgba(255,255,255,.4)', padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Linker kolom: ongemapt */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.35)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 }}>
                Pool — {ongemapt.length} gerechten
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
                {ongemapt.map(function (g) {
                  var gang = getGang(g.gang_slug);
                  return (
                    <div
                      key={g.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 9, cursor: 'pointer', transition: 'border-color .15s' }}
                      onClick={function () { openGangPicker(g); }}
                    >
                      <span style={{ fontSize: 14 }}>{gang.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.naam}</div>
                        <div style={{ fontSize: 10, color: gang.kleur, fontWeight: 600 }}>{gang.label}</div>
                      </div>
                      <i className="fa-solid fa-arrow-right" style={{ fontSize: 10, color: 'rgba(255,255,255,.2)' }} />
                    </div>
                  );
                })}
                {ongemapt.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px', fontSize: 12, color: 'rgba(255,255,255,.2)', border: '1px dashed var(--border)', borderRadius: 9 }}>
                    ✅ Alle gerechten zijn ingedeeld!
                  </div>
                )}
              </div>
            </div>

            {/* Rechter kolom: mappen */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {GANGEN.map(function (gang) {
                var lijst = mapData[gang.slug] || [];
                return (
                  <MapStation
                    key={gang.slug}
                    gang={gang}
                    gerechten={lijst}
                    onRemove={removeFromMap}
                    onPublish={publishGang}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Gang picker modal */}
      <GangPickerModal
        gerecht={picking}
        onPick={placeInMap}
        onClose={function () { setPicking(null); }}
      />

      {/* Details / Edit modal */}
      <GerechtDetailsModal
        gerecht={viewingGerecht}
        onSave={handleSaveDetails}
        onDelete={handleDeleteDetails}
        onClose={function () { setViewingGerecht(null); }}
        supabase={supabase}
      />
    </div>
  );
}
