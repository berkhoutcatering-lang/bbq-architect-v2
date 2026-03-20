'use client';
import { useSupabase } from '@/lib/useSupabase';
import { fmt } from '@/lib/utils';
import Link from 'next/link';

export default function Dashboard() {
  var ev = useSupabase('events', []);
  var fac = useSupabase('facturen', []);
  var off = useSupabase('offertes', []);
  var inv = useSupabase('inventory', []);
  var sug = useSupabase('prep_suggestions', []);
  var gan = useSupabase('gangen', []);
  var ger = useSupabase('gerechten', []);

  var events = ev.data;
  var facturen = fac.data;
  var offertes = off.data;
  var inventory = inv.data;
  var suggestions = sug.data;
  var gangenData = gan.data;
  var gerechtenData = ger.data;

  // Stats
  var confirmedEvents = events.filter(e => e.status === 'confirmed').length;
  var today = new Date().toISOString().slice(0, 10);

  var betaaldFacturen = facturen.filter(f => f.status === 'betaald');
  var omzet = 0;
  betaaldFacturen.forEach(f => {
    (f.items || []).forEach(item => { omzet += (item.qty || 0) * (item.prijs || 0); });
  });

  var openFacturen = facturen.filter(f => f.status !== 'betaald' && f.status !== 'geannuleerd');

  var upcoming = events
    .filter(e => e.date >= today)
    .sort((a, b) => a.date < b.date ? -1 : 1)
    .slice(0, 5);

  var lowStockItems = inventory.filter(item => (item.current_stock || 0) < (item.min_stock || 0));
  var pendingSuggestions = suggestions.filter(s => s.status === 'pending');

  var prepEvents = offertes
    .filter(o => o.menu_selectie && o.datum >= today)
    .sort((a, b) => a.datum < b.datum ? -1 : 1)
    .slice(0, 3);

  return (
    <div className="artisan-dashboard">
      {/* HERO SECTION - THE SHOWMANSHIP */}
      <div className="artisan-hero">
        <div className="hero-overlay"></div>
        <img src="/pitmaster-hero.png" alt="Artisan Pitmaster" className="hero-img" />
        <div className="hero-content">
          <div className="hero-badge"><i className="fa-solid fa-fire-flame-curved"></i> ARTISAN PITMASTER MODE</div>
          <h1 className="hero-title">PITMASTER COMMAND CENTER</h1>
          <p className="hero-subtitle">Vakmanschap in elke graad. De smokers draaien, jouw data staat scherp.</p>

          <div className="hero-quick-stats">
            <div className="h-stat">
              <span className="h-val">{confirmedEvents}</span>
              <span className="h-lbl">CONFIRMED EVENTS</span>
            </div>
            <div className="h-stat">
              <span className="h-val">{fmt(omzet)}</span>
              <span className="h-lbl">GEREALISEERDE OMZET</span>
            </div>
            <div className="h-stat danger">
              <span className="h-val">{lowStockItems.length}</span>
              <span className="h-lbl">STOCK ALERTS</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-layout-grid">
        {/* MAIN COLUMN: OPERATIONEEL */}
        <div className="dash-col-main">

          {/* BANNERS FOR ACTION */}
          {lowStockItems.length > 0 && (
            <Link href="/voorraad" className="artisan-action-banner danger">
              <i className="fa-solid fa-boxes-stacked"></i>
              <div className="banner-txt">
                <div className="b-title">VOORRAAD TE LAAG</div>
                <div className="b-sub">{lowStockItems.length} items onder minimum niveau. Bestel of prep nu.</div>
              </div>
              <span className="b-btn">BIJVULLEN →</span>
            </Link>
          )}

          {pendingSuggestions.length > 0 && (
            <Link href="/agenda" className="artisan-action-banner info">
              <i className="fa-solid fa-wand-magic-sparkles"></i>
              <div className="banner-txt">
                <div className="b-title">PITMASTER SUGGESTIES</div>
                <div className="b-sub">{pendingSuggestions.length} taken klaar voor inplanning door de Digital Pitmaster.</div>
              </div>
              <span className="b-btn">BEKIJK →</span>
            </Link>
          )}

          {/* PREP PLANNING */}
          <div className="dash-section">
            <h2 className="section-title"><i className="fa-solid fa-clipboard-list"></i> DAGPLANNING & PREP</h2>
            <div className="artisan-panel">
              {prepEvents.length === 0 && <p className="empty-msg">Geen actuele prep voor vandaag.</p>}
              {prepEvents.map(offerte => (
                <div key={offerte.id} className="prep-card">
                  <div className="prep-header">
                    <span className="prep-client">{offerte.client_naam}</span>
                    <span className="prep-date">{offerte.datum} • {offerte.aantal_gasten}p</span>
                  </div>
                  <div className="prep-dishes">
                    {gangenData.sort((a, b) => (a.volgorde || 0) - (b.volgorde || 0)).map(gang => {
                      var sel = typeof offerte.menu_selectie === 'string' ? JSON.parse(offerte.menu_selectie) : offerte.menu_selectie;
                      var dishes = sel[gang.slug] || [];
                      if (dishes.length === 0) return null;
                      return (
                        <div key={gang.slug} className="prep-gang-row">
                          <span className="gang-name">{gang.naam}:</span>
                          <span className="gang-dishes">{dishes.join(', ')}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FINANCIEEL OVERZICHT */}
          <div className="dash-section">
            <h2 className="section-title"><i className="fa-solid fa-chart-line"></i> DE CIJFERS</h2>
            <div className="artisan-stat-row">
              <div className="artisan-stat-box">
                <div className="s-lbl">OPEN FACTUREN</div>
                <div className="s-val">{openFacturen.length}</div>
              </div>
              <div className="artisan-stat-box highlight">
                <div className="s-lbl">CONFIRMED EVENTS</div>
                <div className="s-val">{confirmedEvents}</div>
              </div>
              <div className="artisan-stat-box">
                <div className="s-lbl">TOTAAL EVENTS</div>
                <div className="s-val">{events.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* SIDE COLUMN: AGENDA & NAV */}
        <div className="dash-col-side">
          <div className="dash-section">
            <h2 className="section-title"><i className="fa-solid fa-calendar-days"></i> AGENDA</h2>
            <div className="artisan-panel flat">
              {upcoming.length === 0 && <p className="empty-msg">Geen events gepland</p>}
              {upcoming.map(ev2 => (
                <Link href="/events" key={ev2.id} className="side-row">
                  <div className="row-date">{ev2.date.split('-').reverse().slice(0, 2).join('/')}</div>
                  <div className="row-body">
                    <div className="row-title">{ev2.name}</div>
                    <div className="row-meta">{ev2.guests}p • {ev2.location}</div>
                  </div>
                  {ev2.status === 'optie' && <div className="status-dot orange" title="Optie"></div>}
                </Link>
              ))}
            </div>
          </div>

          <div className="dash-section mt-24">
            <h2 className="section-title"><i className="fa-solid fa-bolt"></i> DASHBOARD SNELKOPPLINGEN</h2>
            <div className="artisan-grid-nav">
              <Link href="/offertes" className="nav-box"><i className="fa-solid fa-file-contract"></i><span>OFFERTE</span></Link>
              <Link href="/facturen" className="nav-box"><i className="fa-solid fa-file-invoice-dollar"></i><span>FACTUUR</span></Link>
              <Link href="/uren" className="nav-box"><i className="fa-solid fa-clock"></i><span>UREN</span></Link>
              <Link href="/logistiek" className="nav-box"><i className="fa-solid fa-truck-loading"></i><span>LOGISTIEK</span></Link>
              <Link href="/recepten" className="nav-box"><i className="fa-solid fa-utensils"></i><span>RECEPTEN</span></Link>
              <Link href="/voorraad" className="nav-box"><i className="fa-solid fa-box-open"></i><span>VOORRAAD</span></Link>
            </div>
          </div>

          {/* PITMASTER QUOTE */}
          <div className="pitmaster-quote">
            <i className="fa-solid fa-quote-left"></i>
            <p>Vakmanschap is niet alleen hoe je het vlees snijdt, maar ook hoe je de zaak runt.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
