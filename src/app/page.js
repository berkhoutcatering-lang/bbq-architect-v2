'use client';
import { useSupabase } from '@/lib/useSupabase';
import { fmt, fmtNl } from '@/lib/utils';
import Link from 'next/link';

export default function Dashboard() {
  var ev = useSupabase('events', []);
  var fac = useSupabase('facturen', []);
  var off = useSupabase('offertes', []);
  var rec = useSupabase('recepten', []);
  var inv = useSupabase('inventory', []);
  var sug = useSupabase('prep_suggestions', []);
  var gan = useSupabase('gangen', []);
  var ger = useSupabase('gerechten', []);
  var hac = useSupabase('haccp_records', []);

  var events = ev.data;
  var facturen = fac.data;
  var offertes = off.data;
  var recepten = rec.data;
  var inventory = inv.data;
  var suggestions = sug.data;
  var gangenData = gan.data;
  var gerechtenData = ger.data;
  var haccpRecords = hac.data;

  // Stats
  var totalEvents = events.length;
  var confirmedEvents = events.filter(function (e) { return e.status === 'confirmed'; }).length;
  var completedEvents = events.filter(function (e) { return e.status === 'completed'; }).length;

  var openFacturen = facturen.filter(function (f) { return f.status === 'concept' || f.status === 'verzonden'; });
  var openBedrag = 0;
  openFacturen.forEach(function (f) {
    (f.items || []).forEach(function (item) { openBedrag += (item.qty || 0) * (item.prijs || 0); });
  });

  var betaaldFacturen = facturen.filter(function (f) { return f.status === 'betaald'; });
  var omzet = 0;
  betaaldFacturen.forEach(function (f) {
    (f.items || []).forEach(function (item) { omzet += (item.qty || 0) * (item.prijs || 0); });
  });

  var openOffertes = offertes.filter(function (o) { return o.status === 'concept' || o.status === 'verzonden'; });

  // Prognose from events
  var prognose = 0;
  events.forEach(function (e) { prognose += (e.guests || 0) * (e.ppp || 0); });

  // Upcoming events (next 5)
  var today = new Date().toISOString().slice(0, 10);
  var upcoming = events
    .filter(function (e) { return e.date >= today; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
    .slice(0, 5);

  // LOW STOCK ALERTS
  var lowStockItems = inventory.filter(function (item) {
    return (item.current_stock || 0) < (item.min_stock || 0);
  });

  // Pending suggestions
  var pendingSuggestions = suggestions.filter(function (s) { return s.status === 'pending'; });

  // ═══ VANDAAG PREPPEN ═══
  // Find today's (or next) events that have a menu
  var prepEvents = offertes
    .filter(function (o) { return o.menu_selectie && o.datum >= today; })
    .sort(function (a, b) { return a.datum < b.datum ? -1 : 1; })
    .slice(0, 3);

  // ═══ MARGE CALCULATION ENGINE (Dashboard) ═══
  function getInvPrice(naam) {
    var item = inventory.find(function (i) { return i.naam && i.naam.toLowerCase() === naam.toLowerCase(); });
    return item ? { price: item.purchase_price || 0, unit: item.unit || 'kg', yield_factor: item.yield_factor || 1.0 } : null;
  }
  function calcDishCostPP(gerechtNaam) {
    var g = gerechtenData.find(function (d) { return d.naam === gerechtNaam; });
    if (!g || !g.ingredient_costs) return 0;
    return (g.ingredient_costs || []).reduce(function (sum, item) {
      var inv2 = getInvPrice(item.naam);
      var price = inv2 ? inv2.price : 0;
      var yld = item.yield || (inv2 ? inv2.yield_factor : 1.0) || 1.0;
      var uf = 1;
      if (item.unit === 'g' && inv2 && inv2.unit === 'kg') uf = 0.001;
      if (item.unit === 'ml' && inv2 && inv2.unit === 'L') uf = 0.001;
      return sum + ((item.qty_pp || 0) * uf / yld) * price;
    }, 0);
  }
  function calcMargeForOfferte(o) {
    try {
      var gasten = o.aantal_gasten || (o.items && o.items[0] ? o.items[0].qty : 0) || 0;
      var pp = o.basis_prijs_pp || 38.50;
      var revenue = gasten * pp;
      var fcPP = 0;
      var ms = o.menu_selectie;
      if (Array.isArray(ms)) ms.forEach(function (s) { if (s) fcPP += calcDishCostPP(s.gerecht_naam || s.naam || ''); });
      var fcTotal = fcPP * gasten;
      var vk = Array.isArray(o.vaste_kosten) ? o.vaste_kosten : [];
      var vasteKosten = vk.reduce(function (s2, k) { return s2 + (parseFloat(k.bedrag) || 0); }, 0);
      var profit = revenue - fcTotal - vasteKosten;
      var pct = revenue > 0 ? (profit / revenue) * 100 : 0;
      return { gasten: gasten, omzet: revenue, foodcost: fcTotal, vasteKosten: vasteKosten, winst: profit, margePct: pct };
    } catch (e) {
      console.error('[MARGE] dashboard calc error:', e);
      return { gasten: 0, omzet: 0, foodcost: 0, vasteKosten: 0, winst: 0, margePct: 0 };
    }
  }
  var lowMargeOffertes = offertes.filter(function (o) {
    if (!o.menu_selectie || !Array.isArray(o.menu_selectie) || o.menu_selectie.length === 0) return false;
    var m = calcMargeForOfferte(o);
    return m.gasten > 0 && m.margePct < 60 && o.datum >= today;
  });

  // HACCP MISSING LOGS
  var haccpMissing = offertes.filter(function (o) {
    if (o.status !== 'definitief' || !o.datum || o.datum < today) return false;
    var hasLogs = haccpRecords.some(function (r) { return r.offerte_id === String(o.id); });
    return !hasLogs;
  });


  return (
    <>
      {/* BUS-CHECK WARNING */}
      {(function () {
        var busWarnings = offertes.filter(function (o) {
          if (o.status !== 'definitief' || !o.menu_selectie) return false;
          var bc = o.bus_check || {};
          var checked = (bc.checked || []).length;
          return !bc.completed_at && o.datum >= today;
        });
        if (busWarnings.length === 0) return null;
        return busWarnings.map(function (o) {
          var checked = ((o.bus_check || {}).checked || []).length;
          return (
            <Link href="/logistiek" key={'bus-' + o.id} style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
              <div className="bus-warning-banner">
                <i className="fa-solid fa-truck" style={{ fontSize: 16, color: '#e67e22' }}></i>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>⚠️ Bussemaker — {o.client_naam}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    Bus niet volledig geladen ({checked} items afgevinkt) — {o.datum}
                  </div>
                </div>
                <span className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Bus-Check →</span>
              </div>
            </Link>
          );
        });
      })()}

      {/* MARGE / PRICE-SHOCK WARNING */}
      {lowMargeOffertes.map(function (o) {
        var m = calcMargeForOfferte(o);
        return (
          <Link href="/offertes" key={'marge-' + o.id} style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
            <div className="price-shock-banner">
              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 16, color: 'var(--red)' }}></i>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>🔴 Low Margin Alert — {o.client_naam}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Marge slechts {m.margePct.toFixed(1)}% — Netto winst €{m.winst.toFixed(2)} op €{m.omzet.toFixed(2)} omzet
                </div>
              </div>
              <span className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Bekijk →</span>
            </div>
          </Link>
        );
      })}

      {/* HACCP MISSING-LOG WARNING */}
      {haccpMissing.map(function (o) {
        return (
          <Link href="/haccp" key={'haccp-' + o.id} style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
            <div className="haccp-missing-banner">
              <i className="fa-solid fa-shield-halved" style={{ fontSize: 16, color: '#c83232' }}></i>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>🌡️ HACCP metingen ontbreken — {o.client_naam}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Geen temperatuurregistraties voor dit event ({o.datum})
                </div>
              </div>
              <span className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Registreren →</span>
            </div>
          </Link>
        );
      })}


      {/* FLOATING LOW-STOCK ALERTS */}
      {lowStockItems.length > 0 && (
        <div className="low-stock-float">
          <div className="low-stock-float-header">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span>ANTIGRAVITY ALERT</span>
            <span className="low-stock-float-count">{lowStockItems.length}</span>
          </div>
          {lowStockItems.map(function (item) {
            var pct = Math.round(((item.current_stock || 0) / (item.min_stock || 1)) * 100);
            return (
              <Link href="/voorraad" key={item.id} className="low-stock-float-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <i className="fa-solid fa-box-open" style={{ color: 'var(--red)', fontSize: 12 }}></i>
                  <span style={{ fontWeight: 800, fontSize: 12, flex: 1 }}>VOORRAAD TE LAAG: Bestel of Prep {item.naam}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: 'rgba(239,68,68,.15)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg, #ef4444, #dc2626)', borderRadius: 3 }}></div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>
                    {item.current_stock}{item.unit} / {item.min_stock}{item.unit} min.
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* PENDING PREP SUGGESTIONS BANNER */}
      {pendingSuggestions.length > 0 && (
        <div className="prep-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fa-solid fa-robot" style={{ fontSize: 16, color: 'var(--purple)' }}></i>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>
                {pendingSuggestions.length} Smart Prep-Suggestie{pendingSuggestions.length > 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                {pendingSuggestions.map(function (s) { return s.task_name; }).join(' · ')}
              </div>
            </div>
          </div>
          <Link href="/agenda" className="btn btn-brand btn-sm" style={{ textDecoration: 'none', fontSize: 11 }}>
            <i className="fa-solid fa-calendar-check"></i> Bekijk Agenda
          </Link>
        </div>
      )}

      {/* OFFERTE OPTIE NOTIFICATIONS */}
      {events.filter(function (e) { return e.status === 'optie' && e.offerte_id; }).length > 0 && (
        <div style={{ padding: '14px 18px', background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.12)', borderRadius: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fa-solid fa-file-signature" style={{ fontSize: 16, color: 'var(--brand)' }}></i>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>
                {events.filter(function (e) { return e.status === 'optie' && e.offerte_id; }).length} Offerte-Optie{events.filter(function (e) { return e.status === 'optie' && e.offerte_id; }).length > 1 ? 's' : ''} in Agenda
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                {events.filter(function (e) { return e.status === 'optie' && e.offerte_id; }).map(function (e) { return e.name; }).join(' · ')}
              </div>
            </div>
          </div>
          <Link href="/events" className="btn btn-brand btn-sm" style={{ textDecoration: 'none', fontSize: 11 }}>
            <i className="fa-solid fa-eye"></i> Bekijk Events
          </Link>
        </div>
      )}

      {/* ═══ VANDAAG PREPPEN ═══ */}
      {prepEvents.length > 0 && (
        <div className="prep-today-section">
          <div className="prep-today-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fa-solid fa-fire" style={{ fontSize: 18, color: '#B48C14' }}></i>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>🔥 Prep Schema</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Eerstvolgende events</div>
              </div>
            </div>
            <Link href="/service" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', fontSize: 11 }}>
              📋 Service Mode →
            </Link>
          </div>

          {prepEvents.map(function (offerte) {
            var menuSel = typeof offerte.menu_selectie === 'string' ? JSON.parse(offerte.menu_selectie) : offerte.menu_selectie;
            var aantalNormaal = (offerte.aantal_gasten || 0) - (offerte.aantal_vega || 0);
            var aantalVega = offerte.aantal_vega || 0;

            return (
              <div key={offerte.id} className="prep-today-event">
                <div className="prep-today-event-header">
                  <div>
                    <span style={{ fontWeight: 700 }}>{offerte.client_naam}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 10 }}>
                      {offerte.datum} • {offerte.aantal_gasten} gasten
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#B48C14' }}>🍖 {aantalNormaal}</span>
                    {aantalVega > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7A2F' }}>🌿 {aantalVega}</span>}
                  </div>
                </div>

                {gangenData.sort(function (a, b) { return (a.volgorde || 0) - (b.volgorde || 0); }).map(function (gang) {
                  var gangDishes = menuSel[gang.slug] || [];
                  if (gangDishes.length === 0) return null;

                  return (
                    <div key={gang.slug} className="prep-today-gang">
                      <div className="prep-today-gang-title">Gang — {gang.naam}</div>
                      {gangDishes.map(function (dishName, i) {
                        var dish = gerechtenData.find(function (g) { return g.naam === dishName && g.gang_slug === gang.slug; }) || {};
                        return (
                          <div key={i} className="prep-today-dish">
                            <div className="prep-today-dish-header">
                              {dish.foto_url && <img src={dish.foto_url} alt={dishName} className="prep-today-dish-foto" />}
                              <div className="prep-today-dish-info">
                                <div className="prep-today-dish-name">
                                  <span style={{ fontWeight: 700, color: '#B48C14', marginRight: 6 }}>[{aantalNormaal}]x</span>
                                  {dishName}
                                </div>
                                {dish.beschrijving && <div className="prep-today-dish-desc">{dish.beschrijving}</div>}
                              </div>
                            </div>
                            {dish.ingredienten && dish.ingredienten.length > 0 && (
                              <div className="prep-today-ingredients">
                                {dish.ingredienten.map(function (ing, j) {
                                  return <span key={j} className="bon-ingredient-chip">{ing}</span>;
                                })}
                              </div>
                            )}
                            {dish.bereidingswijze && (
                              <div className="prep-today-bereiding">👨‍🍳 {dish.bereidingswijze}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Actions */}
      <div className="quick-grid">
        <Link href="/events" className="quick-btn">
          <i className="fa-solid fa-plus-circle"></i>
          <span>Nieuw Event</span>
        </Link>
        <Link href="/offertes" className="quick-btn">
          <i className="fa-solid fa-file-signature"></i>
          <span>Offerte Maken</span>
        </Link>
        <Link href="/facturen" className="quick-btn">
          <i className="fa-solid fa-file-invoice"></i>
          <span>Factuur Maken</span>
        </Link>
        <Link href="/haccp" className="quick-btn">
          <i className="fa-solid fa-shield-halved"></i>
          <span>HACCP Log</span>
        </Link>
        <Link href="/logistiek" className="quick-btn">
          <i className="fa-solid fa-truck"></i>
          <span>Logistiek</span>
        </Link>
        <Link href="/recepten" className="quick-btn">
          <i className="fa-solid fa-utensils"></i>
          <span>Recepten</span>
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(255,140,0,.12)', color: 'var(--brand)' }}>
            <i className="fa-solid fa-fire"></i>
          </div>
          <div className="stat-val">{totalEvents}</div>
          <div className="stat-label">Events</div>
          <div className="stat-sub">{confirmedEvents} bevestigd · {completedEvents} voltooid</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}>
            <i className="fa-solid fa-euro-sign"></i>
          </div>
          <div className="stat-val">{fmt(omzet)}</div>
          <div className="stat-label">Omzet</div>
          <div className="stat-sub">Betaalde facturen</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,.12)', color: 'var(--amber)' }}>
            <i className="fa-solid fa-file-invoice"></i>
          </div>
          <div className="stat-val">{openFacturen.length}</div>
          <div className="stat-label">Open Facturen</div>
          <div className="stat-sub">{fmt(openBedrag)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--red)' }}>
            <i className="fa-solid fa-boxes-stacked"></i>
          </div>
          <div className="stat-val">{lowStockItems.length}</div>
          <div className="stat-label">Voorraad Alerts</div>
          <div className="stat-sub">{inventory.length} items totaal</div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="upcoming-section">
        <h3>Aankomende Events</h3>
        <div className="panel">
          {upcoming.length === 0 && (
            <div className="empty-state">
              <i className="fa-solid fa-calendar-xmark"></i>
              <p>Geen aankomende events</p>
              <Link href="/events" className="btn btn-brand btn-sm">Event Toevoegen</Link>
            </div>
          )}
          {upcoming.map(function (ev) {
            var parts = (ev.date || '').split('-');
            var monthNames = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
            var month = parts[1] ? monthNames[parseInt(parts[1], 10) - 1] : '';
            var day = parts[2] || '';
            var rowGlow = ev.status === 'optie' ? ' ev-row-optie' : ev.status === 'confirmed' ? ' ev-row-confirmed' : '';
            var pillClass = ev.status === 'completed' ? 'pill-green' : ev.status === 'confirmed' ? 'pill-green' : ev.status === 'optie' ? 'pill-optie' : 'pill-amber';
            var pillLabel = ev.status === 'completed' ? '✓ Voltooid' : ev.status === 'confirmed' ? '✅ Bevestigd' : ev.status === 'optie' ? '🟠 Optie' : 'In afwachting';
            return (
              <Link href="/events" key={ev.id} className={'ev-row' + rowGlow} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="ev-date-block">
                  <span className="ev-month">{month}</span>
                  <span className="ev-day">{day}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    {ev.offerte_id && <i className="fa-solid fa-link" style={{ fontSize: 9, color: 'var(--brand)', marginRight: 6 }}></i>}
                    {ev.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    <i className="fa-solid fa-location-dot" style={{ marginRight: 4 }}></i>{ev.location || '—'}
                    <span style={{ marginLeft: 12 }}>
                      <i className="fa-solid fa-users" style={{ marginRight: 4 }}></i>{ev.guests} gasten
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600 }}>{fmt((ev.guests || 0) * (ev.ppp || 0))}</div>
                  <span className={'pill ' + pillClass}>{pillLabel}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Facturen */}
      <div className="upcoming-section">
        <h3>Recente Facturen</h3>
        <div className="panel">
          {facturen.length === 0 && (
            <div className="empty-state">
              <i className="fa-solid fa-file-invoice"></i>
              <p>Nog geen facturen</p>
            </div>
          )}
          {facturen.slice(-5).reverse().map(function (f) {
            var total = 0;
            (f.items || []).forEach(function (item) { total += (item.qty || 0) * (item.prijs || 0); });
            var pillClass = f.status === 'betaald' ? 'pill-green' : f.status === 'verzonden' ? 'pill-amber' : f.status === 'vervallen' ? 'pill-red' : 'pill-blue';
            return (
              <Link href="/facturen" key={f.id} className="ev-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{f.nummer}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.client_naam}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600 }}>{fmt(total)}</div>
                  <span className={'pill ' + pillClass}>{f.status}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
