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
    <div className="artisan-dashboard minimalist">
      {/* HERO SECTION - PURE SHOWMANSHIP */}
      <div className="artisan-hero simple">
        <div className="hero-overlay"></div>
        <img src="/pitmaster-hero.png" alt="Artisan Pitmaster" className="hero-img" />
        <div className="hero-content">
          <div className="hero-badge">RESTAURANT KWALITEIT • OPEN VUUR</div>
          <h1 className="hero-title">PITMASTER COMMAND CENTER</h1>
        </div>
      </div>

      <div className="dashboard-content-single">

        {/* ACTIE CENTRUM (CONSOLIDATED ALERTS) */}
        {(lowStockItems.length > 0 || pendingSuggestions.length > 0) && (
          <div className="artisan-alert-center mb-16">
            <div className="alert-center-header">
              ACTIE VEREIST
            </div>
            <div className="alert-center-body">
              {lowStockItems.length > 0 && (
                <Link href="/voorraad" className="alert-item danger">
                  <i className="fa-solid fa-boxes-stacked"></i>
                  <span><strong>VOORRAAD:</strong> {lowStockItems.length} items onder minimum</span>
                </Link>
              )}
              {pendingSuggestions.length > 0 && (
                <Link href="/agenda" className="alert-item info">
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  <span><strong>PLANNING:</strong> {pendingSuggestions.length} Pitmaster suggesties</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* TOP STATS BAR - GOLD & CHARCOAL */}
        <div className="artisan-compact-stats">
          <div className="c-stat">
            <span className="c-lbl">CONFIRMED EVENTS</span>
            <span className="c-val">{confirmedEvents}</span>
          </div>
          <div className="c-stat highlight">
            <span className="c-lbl">GEREALISEERDE OMZET</span>
            <span className="c-val">{fmt(omzet)}</span>
          </div>
          <div className="c-stat">
            <span className="c-lbl">OPEN FACTUREN</span>
            <span className="c-val">{openFacturen.length}</span>
          </div>
        </div>

        {/* DAGPLANNING & PREP */}
        <div className="dash-section">
          <h2 className="section-title">DAGPLANNING & PREP</h2>
          <div className="artisan-panel">
            {prepEvents.length === 0 && <p className="empty-msg">Geen actuele prep voor vandaag.</p>}
            {prepEvents.map(offerte => (
              <div key={offerte.id} className="prep-card">
                <div className="prep-header">
                  <span className="prep-client">{offerte.client_naam}</span>
                  <span className="prep-date">{offerte.datum.split('-').reverse().join('-')} • {offerte.aantal_gasten}p</span>
                </div>
                <div className="prep-dishes">
                  {gangenData.sort((a, b) => (a.volgorde || 0) - (b.volgorde || 0)).map(gang => {
                    var sel = typeof offerte.menu_selectie === 'string' ? JSON.parse(offerte.menu_selectie) : offerte.menu_selectie;
                    var dishes = sel[gang.slug] || [];
                    if (dishes.length === 0) return null;
                    return (
                      <div key={gang.slug} className="prep-gang-row">
                        <span className="gang-name">{gang.naam}</span>
                        <span className="gang-dishes">{dishes.join(', ')}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* VOLGENDE EVENTS */}
        <div className="dash-section">
          <h2 className="section-title">VOLGENDE EVENTS</h2>
          <div className="artisan-panel">
            {upcoming.length === 0 && <p className="empty-msg">Geen events gepland</p>}
            {upcoming.map(ev2 => (
              <Link href="/events" key={ev2.id} className="side-row">
                <div className="row-date">{ev2.date.split('-').reverse().slice(0, 2).join('/')}</div>
                <div className="row-body">
                  <div className="row-title">{ev2.name}</div>
                  <div className="row-meta">{ev2.guests}p • {ev2.location}</div>
                </div>
                {ev2.status === 'optie' && <div className="status-dot orange" title="Optie"></div>}
                <span className="row-price">{fmt((ev2.guests || 0) * (ev2.ppp || 0))}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* QUICK SHORTCUTS - CIRCULAR GOLD */}
        <div className="dash-section center">
          <div className="artisan-shortcut-bar">
            <Link href="/offertes" className="icon-nav-btn" title="Offertes"><i className="fa-solid fa-file-contract"></i></Link>
            <Link href="/facturen" className="icon-nav-btn" title="Facturen"><i className="fa-solid fa-file-invoice-dollar"></i></Link>
            <Link href="/uren" className="icon-nav-btn" title="Uren"><i className="fa-solid fa-clock"></i></Link>
            <Link href="/logistiek" className="icon-nav-btn" title="Logistiek"><i className="fa-solid fa-truck-loading"></i></Link>
            <Link href="/recepten" className="icon-nav-btn" title="Recepten"><i className="fa-solid fa-utensils"></i></Link>
          </div>
        </div>

        {/* PITMASTER QUOTE - THE "CHEF" VOICE */}
        <div className="pitmaster-quote">
          <p>"Vakmanschap is niet alleen hoe je het vlees snijdt, maar ook hoe je de volledige restaurant-ervaring op locatie overbrengt."</p>
          <span className="quote-author">— Mathijs Berkhout</span>
        </div>
      </div>
    </div>
  );
}
