'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

// ── Quick chips per pagina ─────────────────────────────────────────────────
var PAGE_CHIPS = {
    '/': ['Wat moet ik vandaag regelen?', 'Week-overzicht', 'Lage voorraad check', 'Omzet samenvatting'],
    '/events': ['Prep-lijst voor aankomend event', 'Maak een tijdlijn', 'Welke events komen eraan?', 'Event aanmaken'],
    '/agenda': ['Planning komende week', 'Wat staat er dit weekend?', 'Prep-taken overzicht', 'Agenda samenvatting'],
    '/gerechten': ['20 gerechten met buikspek', 'Vegetarische hapjes bedenken', 'Menubalans analyseren', 'Dessert-ideeën BBQ'],
    '/recepten': ['Bereken vlees voor 80 gasten', 'Pulled pork bereidingstijd', 'Brisket recept tips', 'Recept toevoegen'],
    '/offertes': ['Wat is mijn totale omzet?', 'Hoeveel open offertes?', 'Offerte follow-up tips', 'Marge berekenen'],
    '/facturen': ['Openstaande facturen', 'Bijna vervallen facturen', 'Cashflow overzicht', 'Debiteurenbeheer tips'],
    '/voorraad': ['Lage voorraad check', 'Wat moet ik bijbestellen?', 'Par levels uitleggen', 'Voorraad voor event'],
    '/inkoop': ['Inkooplijst genereren', 'Per winkel groeperen', 'Bulk-voordelen berekenen', 'Inkoop voor event'],
    '/haccp': ['Temperaturen checklist', 'Ontbrekende HACCP logs', 'Temperatuur-alerts', 'HACCP-regels uitleggen'],
    '/service': ['Battle plan voor vandaag', 'Tijdlijn service', 'Snel probleem oplossen', 'Temperaturen vlees'],
    '/uren': ['Uren deze maand', 'Overuren berekenen', 'Uren per medewerker', 'Arbeidsrecht NL'],
    '/materieel': ['Materieel voor event', 'Onderhoudstips BBQ', 'Bus-check genereren', 'Capaciteitsberekening'],
    '/logistiek': ['Bus-check genereren', 'Logistiek voor event', 'Inlaadvolgorde tips', 'Vergeten items check'],
    '/boekhouding': ['Omzet dit kwartaal', 'Food cost ratio', 'BTW-tips catering', 'Winst-verlies analyse'],
    '/menu-engineering': ['Stars en Dogs analyse', 'Menu verbeteren voor marge', 'Gerecht vergelijken', 'Menu-balans rapport'],
    '/price-intelligence': ['Leverancier vergelijken', 'Beste prijs vlees', 'Inkoopprijs optimaliseren', 'Seizoensprijzen'],
    '/ai-chat': ['20 gerechten met buikspek', 'Thema-BBQ concepten', 'Zomermenu brainstorm', 'Marktanalyse catering'],
};

// ── Formateer AI-tekst met markdown-like rendering ─────────────────────────
function renderText(text) {
    if (!text) return null;
    return text.split('\n').map(function (line, i) {
        var rendered = [];
        var remaining = line;
        var key = 0;

        // Bold
        while (remaining.includes('**')) {
            var start = remaining.indexOf('**');
            var end = remaining.indexOf('**', start + 2);
            if (end === -1) break;
            if (start > 0) rendered.push(<span key={key++}>{remaining.slice(0, start)}</span>);
            rendered.push(<strong key={key++}>{remaining.slice(start + 2, end)}</strong>);
            remaining = remaining.slice(end + 2);
        }
        if (remaining) rendered.push(<span key={key++}>{remaining}</span>);

        return (
            <span key={i} style={{ display: 'block', marginBottom: line.startsWith('- ') || line.startsWith('• ') ? 2 : 0 }}>
                {rendered.length ? rendered : '\u00A0'}
            </span>
        );
    });
}

// ── Action Card renderer ────────────────────────────────────────────────────
function ActionCard({ action, onConfirm, onReject, isExecuting }) {
    var [collapsed, setCollapsed] = useState(false);
    var tool = action.tool;
    var result = action.result || {};

    var WRITE_TOOLS = new Set([
        'createEvent', 'updateEventStatus', 'createGerecht', 'createGerechtBulk',
        'updateGerecht', 'deleteGerecht', 'deactivateGerechten', 'createRecept',
        'updateRecept', 'updateOfferteStatus', 'updateVoorraadItem', 'createHaccpLog',
        'updateMaterieelStatus', 'saveConversation', 'createFolder'
    ]);

    var isWrite = WRITE_TOOLS.has(tool);

    var TOOL_LABELS = {
        generatePrepList: { icon: '📋', label: 'Prep-lijst gegenereerd', color: '#FFBF00' },
        createGerechtBulk: { icon: '🍽️', label: 'Gerechten klaar om toe te voegen', color: '#FFBF00' },
        getUpcomingEvents: { icon: '📅', label: 'Events opgehaald', color: '#4ade80' },
        getEventDetail: { icon: '🔍', label: 'Event details', color: '#4ade80' },
        createEvent: { icon: '➕', label: 'Nieuw event aanmaken', color: '#FFBF00' },
        updateEventStatus: { icon: '🔄', label: 'Event status bijwerken', color: '#fb923c' },
        getGerechten: { icon: '🍴', label: 'Gerechten overzicht', color: '#4ade80' },
        getGangen: { icon: '📦', label: 'Gangen opgehaald', color: '#4ade80' },
        createGerecht: { icon: '➕', label: 'Gerecht toevoegen', color: '#FFBF00' },
        analyzeMenuBalance: { icon: '⚖️', label: 'Menu-analyse', color: '#818cf8' },
        getRecepten: { icon: '📖', label: 'Recepten opgehaald', color: '#4ade80' },
        calcPortiesVoor: { icon: '🧮', label: 'Portie-berekening', color: '#818cf8' },
        createRecept: { icon: '📖', label: 'Recept toevoegen', color: '#FFBF00' },
        getOffertes: { icon: '📄', label: 'Offertes overzicht', color: '#4ade80' },
        getOpenOffertes: { icon: '📬', label: 'Open offertes', color: '#fb923c' },
        calcOfferteOmzet: { icon: '💰', label: 'Omzet berekend', color: '#4ade80' },
        getFacturen: { icon: '🧾', label: 'Facturen overzicht', color: '#4ade80' },
        getOpenFacturen: { icon: '⚠️', label: 'Openstaande facturen', color: '#fb923c' },
        calcCashflow: { icon: '💸', label: 'Cashflow analyse', color: '#4ade80' },
        getVoorraad: { icon: '🏪', label: 'Voorraad overzicht', color: '#4ade80' },
        getLageVoorraadItems: { icon: '🚨', label: 'Lage voorraad-items', color: '#ef4444' },
        getInkoopLijst: { icon: '🛒', label: 'Inkooplijst gegenereerd', color: '#4ade80' },
        getHaccpLogs: { icon: '🌡️', label: 'HACCP logs', color: '#818cf8' },
        createHaccpLog: { icon: '🌡️', label: 'Temperatuur registreren', color: '#FFBF00' },
        getTemperatureAlerts: { icon: '🚨', label: 'Temperatuur-alerts', color: '#ef4444' },
        getBusCheck: { icon: '🚛', label: 'Bus-check lijst', color: '#4ade80' },
        getWeekOverzicht: { icon: '📆', label: 'Week-overzicht', color: '#818cf8' },
        getDashboardSummary: { icon: '📊', label: 'Dashboard samenvatting', color: '#4ade80' },
        getOmzetPerPeriode: { icon: '💰', label: 'Omzet per periode', color: '#4ade80' },
        getKwartaalOmzet: { icon: '📈', label: 'Kwartaal omzet', color: '#4ade80' },
        calcFoodCostRatio: { icon: '🧮', label: 'Food cost ratio', color: '#818cf8' },
        deactivateGerechten: { icon: '🗑️', label: 'Gerechten verwijderen/deactiveren', color: '#ef4444' },
        filterSystemData: { icon: '🔍', label: 'Data filteren', color: '#fb923c' },
        updateOfferteStatus: { icon: '🔄', label: 'Offerte status wijzigen', color: '#fb923c' },
        updateVoorraadItem: { icon: '📦', label: 'Voorraad bijwerken', color: '#fb923c' },
        saveConversation: { icon: '💾', label: 'Gesprek opslaan', color: '#FFBF00' },
    };

    var meta = TOOL_LABELS[tool] || { icon: '⚙️', label: tool, color: '#6b7280' };

    return (
        <div style={{
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.1)',
            borderLeft: '3px solid ' + meta.color,
            borderRadius: 10,
            margin: '8px 0',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
                onClick={function () { setCollapsed(!collapsed); }}
            >
                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: meta.color, flex: 1 }}>{meta.label}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{collapsed ? '▼ toon' : '▲ verberg'}</span>
            </div>

            {!collapsed && (
                <div style={{ padding: '0 14px 14px' }}>
                    {/* Prep-lijst renderer */}
                    {tool === 'generatePrepList' && result.tijdlijn && (
                        <PrepListRenderer data={result} />
                    )}

                    {/* Bulk gerechten renderer */}
                    {tool === 'createGerechtBulk' && result.gerechten && (
                        <BulkGerechtRenderer gerechten={result.gerechten} args={action.args} />
                    )}

                    {/* Generic JSON preview voor andere tools */}
                    {tool !== 'generatePrepList' && tool !== 'createGerechtBulk' && (
                        <GenericResultRenderer result={result} tool={tool} />
                    )}

                    {/* Bevestigings-knoppen voor schrijf-acties */}
                    {isWrite && !action.executed && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button
                                onClick={function () { onConfirm(action); }}
                                disabled={isExecuting}
                                style={{
                                    background: 'var(--brand, #FFBF00)', color: '#000', border: 'none',
                                    padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700,
                                    cursor: isExecuting ? 'not-allowed' : 'pointer', opacity: isExecuting ? 0.6 : 1
                                }}
                            >
                                {isExecuting ? '⏳ Bezig...' : '✅ Uitvoeren'}
                            </button>
                            <button
                                onClick={function () { onReject(action); }}
                                disabled={isExecuting}
                                style={{
                                    background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.7)',
                                    border: '1px solid rgba(255,255,255,.12)', padding: '7px 14px',
                                    borderRadius: 7, fontSize: 13, cursor: 'pointer'
                                }}
                            >
                                ❌ Afwijzen
                            </button>
                        </div>
                    )}
                    {action.executed && (
                        <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.2)', borderRadius: 6, color: '#4ade80', fontSize: 12, fontWeight: 600 }}>
                            ✅ Uitgevoerd
                        </div>
                    )}
                    {action.rejected && (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,.4)' }}>❌ Afgewezen</div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Prep-lijst renderer ─────────────────────────────────────────────────────
function PrepListRenderer({ data }) {
    function printPrep() {
        var w = window.open('', '_blank');
        var html = '<html><head><title>Prep-lijst: ' + (data.event && data.event.naam) + '</title>';
        html += '<style>body{font-family:Arial,sans-serif;padding:20px;} h1{color:#B48C14} h2{color:#333;border-bottom:2px solid #FFBF00;padding-bottom:4px} .dag{margin-bottom:24px} ul{margin:8px 0} li{margin:4px 0} .mep-table{width:100%;border-collapse:collapse;margin-top:16px} .mep-table th{background:#FFBF00;padding:8px;text-align:left} .mep-table td{padding:6px;border-bottom:1px solid #eee}</style></head><body>';
        html += '<h1>📋 Prep-lijst: ' + (data.event && data.event.naam) + '</h1>';
        html += '<p><strong>Datum:</strong> ' + (data.event && data.event.datum) + ' | <strong>Gasten:</strong> ' + (data.event && data.event.gasten) + '</p>';
        (data.tijdlijn || []).forEach(function (dag) {
            html += '<div class="dag"><h2>' + dag.dag + '</h2><ul>';
            (dag.taken || []).forEach(function (t) { html += '<li>' + t + '</li>'; });
            html += '</ul></div>';
        });
        if (data.mep_lijst && data.mep_lijst.length > 0) {
            html += '<h2>🧾 MEP (Mise-en-place)</h2><table class="mep-table"><tr><th>Recept</th><th>Porties</th><th>Preptime</th><th>Ingrediënten</th></tr>';
            (data.mep_lijst || []).forEach(function (m) {
                html += '<tr><td>' + m.recept + '</td><td>' + m.porties + '</td><td>' + m.preptime + '</td><td>' + (m.ingredienten || []).slice(0, 5).join(', ') + '</td></tr>';
            });
            html += '</table>';
        }
        html += '</body></html>';
        w.document.write(html);
        w.document.close();
        w.print();
    }

    return (
        <div>
            {data.event && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(255,191,0,.08)', borderRadius: 8 }}>
                    <strong style={{ color: 'var(--brand, #FFBF00)' }}>{data.event.naam}</strong>
                    <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, marginLeft: 10 }}>
                        {data.event.datum} • {data.event.gasten} gasten{data.event.locatie ? ' • ' + data.event.locatie : ''}
                    </span>
                </div>
            )}
            {(data.tijdlijn || []).map(function (dag, i) {
                return (
                    <div key={i} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand, #FFBF00)', textTransform: 'uppercase', marginBottom: 4 }}>
                            {dag.label} — {dag.dag}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {(dag.taken || []).map(function (t, j) {
                                return <li key={j} style={{ fontSize: 12, color: 'rgba(255,255,255,.8)', marginBottom: 2 }}>{t}</li>;
                            })}
                        </ul>
                    </div>
                );
            })}
            {data.mep_lijst && data.mep_lijst.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand, #FFBF00)', textTransform: 'uppercase', marginBottom: 8 }}>MEP — Mise-en-place</div>
                    {(data.mep_lijst || []).map(function (m, i) {
                        return (
                            <div key={i} style={{ padding: '6px 10px', background: 'rgba(255,255,255,.04)', borderRadius: 6, marginBottom: 4 }}>
                                <span style={{ fontWeight: 700, fontSize: 12 }}>{m.recept}</span>
                                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, marginLeft: 8 }}>{m.porties} porties • {m.preptime}</span>
                                {m.ingredienten && m.ingredienten.length > 0 && (
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>
                                        {m.ingredienten.slice(0, 6).join(', ')}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            <button
                onClick={printPrep}
                style={{
                    marginTop: 10, background: 'rgba(255,191,0,.15)', border: '1px solid rgba(255,191,0,.3)',
                    color: 'var(--brand, #FFBF00)', padding: '6px 14px', borderRadius: 7,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}
            >
                🖨️ Afdrukken
            </button>
        </div>
    );
}

// ── Bulk gerechten renderer (Buikspek-case) ─────────────────────────────────
function BulkGerechtRenderer({ gerechten, args }) {
    var [selected, setSelected] = useState(function () {
        var s = {};
        (gerechten || []).forEach(function (g, i) { s[i] = true; });
        return s;
    });
    var [aiRejected, setAiRejected] = useState({});

    var selectedCount = Object.values(selected).filter(Boolean).length;

    function toggleAll() {
        var allOn = Object.values(selected).every(Boolean);
        var s = {};
        (gerechten || []).forEach(function (g, i) { s[i] = !allOn; });
        setSelected(s);
    }

    var GANG_COLORS = {
        bite: '#FFBF00',
        hoofdgerecht: '#fb923c',
        vegetarisch: '#4ade80',
        dessert: '#818cf8',
        bijgerecht: '#38bdf8',
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{selectedCount} van {(gerechten || []).length} geselecteerd</span>
                <button onClick={toggleAll} style={{ fontSize: 11, background: 'none', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.6)', padding: '3px 8px', borderRadius: 5, cursor: 'pointer' }}>
                    {Object.values(selected).every(Boolean) ? 'Alles deselecteren' : 'Alles selecteren'}
                </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {(gerechten || []).map(function (g, i) {
                    var isOn = selected[i] !== false;
                    var isRejected = aiRejected[i];
                    var gangColor = GANG_COLORS[g.gang_slug] || '#6b7280';
                    return (
                        <div
                            key={i}
                            onClick={function () { setSelected(function (prev) { return Object.assign({}, prev, { [i]: !prev[i] }); }); }}
                            style={{
                                padding: '10px 12px',
                                background: isRejected ? 'rgba(239,68,68,.08)' : isOn ? 'rgba(255,191,0,.06)' : 'rgba(255,255,255,.03)',
                                border: '1px solid ' + (isRejected ? 'rgba(239,68,68,.3)' : isOn ? 'rgba(255,191,0,.25)' : 'rgba(255,255,255,.08)'),
                                borderRadius: 8,
                                cursor: 'pointer',
                                opacity: isRejected ? 0.5 : 1,
                                transition: 'all .15s',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <input
                                    type="checkbox"
                                    checked={isOn && !isRejected}
                                    readOnly
                                    style={{ marginTop: 2, accentColor: 'var(--brand, #FFBF00)', flexShrink: 0 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: isRejected ? 'rgba(239,68,68,.7)' : '#fff', wordBreak: 'break-word' }}>
                                        {isRejected && '❌ '}{g.naam}
                                    </div>
                                    <div style={{ fontSize: 10, color: gangColor, fontWeight: 700, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        {g.gang_slug}
                                    </div>
                                    {g.beschrijving && (
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 3, lineHeight: 1.4 }}>
                                            {g.beschrijving.slice(0, 80)}{g.beschrijving.length > 80 ? '…' : ''}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Generic result renderer ─────────────────────────────────────────────────
function GenericResultRenderer({ result, tool }) {
    if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
        return <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', padding: '4px 0' }}>Geen data teruggegeven.</div>;
    }

    // Tabel-weergave voor arrays
    var mainArrayKey = Object.keys(result).find(function (k) { return Array.isArray(result[k]) && result[k].length > 0; });
    if (mainArrayKey) {
        var rows = result[mainArrayKey].slice(0, 10);
        var keys = Object.keys(rows[0] || {}).filter(function (k) { return typeof rows[0][k] !== 'object'; }).slice(0, 5);
        if (keys.length > 0) {
            return (
                <div>
                    {/* Summary stats */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        {Object.entries(result).filter(function (e) { return !Array.isArray(e[1]) && typeof e[1] !== 'object'; }).map(function (e) {
                            return (
                                <div key={e[0]} style={{ padding: '4px 10px', background: 'rgba(255,191,0,.08)', borderRadius: 6, fontSize: 11 }}>
                                    <span style={{ color: 'rgba(255,255,255,.5)' }}>{e[0]}: </span>
                                    <span style={{ fontWeight: 700, color: typeof e[1] === 'number' && e[0].includes('omzet') || e[0].includes('totaal') ? '#4ade80' : '#fff' }}>
                                        {typeof e[1] === 'number' ? (e[0].includes('omzet') || e[0].includes('totaal') || e[0].includes('prijs') ? '€' + e[1].toFixed(2) : e[1]) : String(e[1])}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                                <tr>
                                    {keys.map(function (k) {
                                        return <th key={k} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--brand, #FFBF00)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,.1)', whiteSpace: 'nowrap' }}>{k}</th>;
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(function (row, i) {
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                                            {keys.map(function (k) {
                                                var val = row[k];
                                                var display = val === null || val === undefined ? '—' : String(val);
                                                return <td key={k} style={{ padding: '4px 8px', color: 'rgba(255,255,255,.8)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</td>;
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {result[mainArrayKey].length > 10 && (
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', padding: '6px 8px' }}>
                                ...en nog {result[mainArrayKey].length - 10} meer
                            </div>
                        )}
                    </div>
                </div>
            );
        }
    }

    // Fallback: key-value list
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {Object.entries(result).filter(function (e) { return typeof e[1] !== 'object' || e[1] === null; }).slice(0, 8).map(function (e) {
                return (
                    <div key={e[0]} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                        <span style={{ color: 'rgba(255,255,255,.5)', minWidth: 120 }}>{e[0]}:</span>
                        <span style={{ color: '#fff', fontWeight: 600 }}>{String(e[1] ?? '—')}</span>
                    </div>
                );
            })}
            {result.message && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.2)', borderRadius: 6, color: '#4ade80', fontSize: 12 }}>
                    {result.message}
                </div>
            )}
        </div>
    );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function AiAssistant() {
    var pathname = usePathname();
    var [isOpen, setIsOpen] = useState(false);
    var [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hallo chef! 👋 Ik ben je BBQ Copilot. Ik heb toegang tot je hele systeem: events, recepten, menu, offertes, voorraad en meer. Wat kan ik voor je doen?' }
    ]);
    var [input, setInput] = useState('');
    var [isLoading, setIsLoading] = useState(false);
    var [executingActionIdx, setExecutingActionIdx] = useState(null);
    var messagesEndRef = useRef(null);
    var inputRef = useRef(null);

    var chips = PAGE_CHIPS[pathname] || PAGE_CHIPS['/'];

    useEffect(function () {
        if (isOpen) {
            setTimeout(function () { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 50);
            setTimeout(function () { inputRef.current?.focus(); }, 100);
        }
    }, [messages, isOpen]);

    var sendMessage = useCallback(async function (e, overrideText) {
        if (e) e.preventDefault();
        var text = (overrideText || input).trim();
        if (!text || isLoading) return;
        setInput('');

        var userMsg = { role: 'user', content: text };
        var nextMessages = [...messages, userMsg];
        setMessages(nextMessages);
        setIsLoading(true);

        try {
            var apiMessages = nextMessages.map(function (m) {
                return { role: m.role, content: m.content || '' };
            });

            var res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    pathname: pathname,
                    mode: null,
                }),
            });

            var data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Fout bij communicatie met AI');

            var assistantContent = data.choices && data.choices[0] && data.choices[0].message.content || '';
            var actions = data.actions || [];

            setMessages(function (prev) {
                return [...prev, {
                    role: 'assistant',
                    content: assistantContent,
                    actions: actions,
                }];
            });
        } catch (error) {
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '❌ ' + error.message, actions: [] }];
            });
        } finally {
            setIsLoading(false);
        }
    }, [input, isLoading, messages, pathname]);

    async function handleConfirmAction(action, msgIdx, actionIdx) {
        setExecutingActionIdx(actionIdx);
        try {
            var res = await fetch('/api/ai-tools', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: action.tool, params: action.args }),
            });
            var data = await res.json();

            // Update het actie-kaartje als "uitgevoerd"
            setMessages(function (prev) {
                var updated = [...prev];
                if (updated[msgIdx] && updated[msgIdx].actions) {
                    var newActions = updated[msgIdx].actions.map(function (a, i) {
                        if (i === actionIdx) return Object.assign({}, a, { executed: true, executionResult: data.result });
                        return a;
                    });
                    updated[msgIdx] = Object.assign({}, updated[msgIdx], { actions: newActions });
                }
                return updated;
            });

            // Voeg bevestigingsbericht toe
            var confirmText = data.ok
                ? '✅ **Actie uitgevoerd.** ' + (data.result && data.result.message ? data.result.message : 'Klaar!')
                : '❌ Fout: ' + (data.error || 'Onbekende fout');
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: confirmText, actions: [] }];
            });
        } catch (err) {
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '❌ Fout bij uitvoeren: ' + err.message, actions: [] }];
            });
        } finally {
            setExecutingActionIdx(null);
        }
    }

    function handleRejectAction(action, msgIdx, actionIdx) {
        setMessages(function (prev) {
            var updated = [...prev];
            if (updated[msgIdx] && updated[msgIdx].actions) {
                var newActions = updated[msgIdx].actions.map(function (a, i) {
                    if (i === actionIdx) return Object.assign({}, a, { rejected: true });
                    return a;
                });
                updated[msgIdx] = Object.assign({}, updated[msgIdx], { actions: newActions });
            }
            return updated;
        });
    }

    function clearChat() {
        setMessages([{ role: 'assistant', content: 'Gesprek gewist. Waarmee kan ik je helpen?' }]);
    }

    return (
        <div className="ai-assistant-container">
            {/* Toggle Button */}
            <button
                className={'ai-toggle-btn' + (isOpen ? ' active' : '')}
                onClick={function () { setIsOpen(!isOpen); }}
                title="BBQ Copilot — System Operator"
                aria-label="Open BBQ Copilot"
            >
                {isOpen ? <i className="fa-solid fa-xmark" /> : <i className="fa-solid fa-robot" />}
                {!isOpen && (
                    <span style={{
                        position: 'absolute', top: -4, right: -4, background: '#4ade80',
                        width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--bg, #0d0d0d)'
                    }} title="Online" />
                )}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="ai-chat-window panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
                    {/* Header */}
                    <div style={{
                        padding: '14px 16px', borderBottom: '1px solid var(--border)',
                        background: 'linear-gradient(135deg, rgba(180,140,20,.15) 0%, rgba(255,191,0,.08) 100%)',
                        flexShrink: 0
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: 'var(--brand, #FFBF00)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <i className="fa-solid fa-robot" style={{ fontSize: 16, color: '#000' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>BBQ Copilot</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                                        System Operator • Groq ⚡
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={clearChat}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 11, padding: '4px 8px' }}
                                title="Gesprek wissen"
                            >
                                🗑️
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="ai-chat-messages" style={{ flex: 1, overflowY: 'auto' }}>
                        {messages.map(function (msg, msgIdx) {
                            var isUser = msg.role === 'user';
                            return (
                                <div key={msgIdx} className={'ai-message-wrapper ' + (isUser ? 'user' : 'assistant')}>
                                    {!isUser && (
                                        <div className="ai-avatar">
                                            <i className="fa-solid fa-robot" />
                                        </div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className={'ai-message bubble ' + (isUser ? 'user-bubble' : 'assistant-bubble')}>
                                            {renderText(msg.content)}
                                        </div>
                                        {/* Action cards */}
                                        {!isUser && msg.actions && msg.actions.length > 0 && (
                                            <div style={{ marginTop: 4 }}>
                                                {msg.actions.map(function (action, actionIdx) {
                                                    return (
                                                        <ActionCard
                                                            key={actionIdx}
                                                            action={action}
                                                            isExecuting={executingActionIdx === actionIdx}
                                                            onConfirm={function (a) { handleConfirmAction(a, msgIdx, actionIdx); }}
                                                            onReject={function (a) { handleRejectAction(a, msgIdx, actionIdx); }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {isLoading && (
                            <div className="ai-message-wrapper assistant">
                                <div className="ai-avatar"><i className="fa-solid fa-robot" /></div>
                                <div className="ai-message bubble assistant-bubble loading-dots">
                                    <span /><span /><span />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick chips */}
                    {messages.length <= 2 && !isLoading && (
                        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {chips.map(function (s) {
                                return (
                                    <button
                                        key={s}
                                        onClick={function () { sendMessage(null, s); }}
                                        style={{
                                            background: 'rgba(255,191,0,.08)', border: '1px solid rgba(255,191,0,.2)',
                                            color: 'var(--brand, #FFBF00)', padding: '3px 8px', borderRadius: 20,
                                            fontSize: 10, cursor: 'pointer', fontWeight: 600
                                        }}
                                    >
                                        {s}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Input */}
                    <div className="ai-chat-input">
                        <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={function (e) { setInput(e.target.value); }}
                                placeholder="Geef een opdracht of stel een vraag..."
                                disabled={isLoading}
                                autoComplete="off"
                            />
                            <button type="submit" disabled={!input.trim() || isLoading} className="send-btn">
                                <i className="fa-solid fa-paper-plane" />
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
