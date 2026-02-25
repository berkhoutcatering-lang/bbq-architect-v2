'use client';
import { useState, useEffect } from 'react';
import { useSettings, useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';

export default function Instellingen() {
    var { settings, loading, save } = useSettings();
    var ev = useSupabase('events', []);
    var fac = useSupabase('facturen', []);
    var off = useSupabase('offertes', []);
    var rec = useSupabase('recepten', []);
    var mat = useSupabase('materieel', []);
    var showToast = useToast();
    var [form, setForm] = useState(null);

    useEffect(function () {
        if (settings && !form) setForm(JSON.parse(JSON.stringify(settings)));
    }, [settings]);

    function setField(key, val) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveSettings() {
        var { id, created_at, updated_at, ...data } = form;
        save(data).then(function () { showToast('Instellingen opgeslagen', 'success'); });
    }

    if (loading || !form) return <div className="empty-state"><i className="fa-solid fa-spinner fa-spin"></i><p>Laden...</p></div>;

    return (
        <>
            {/* Bedrijfsgegevens */}
            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head"><h3><i className="fa-solid fa-building" style={{ marginRight: 8, color: 'var(--brand)' }}></i>Bedrijfsgegevens</h3></div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Bedrijfsnaam</label><input value={form.bedrijfsnaam || ''} onChange={function (e) { setField('bedrijfsnaam', e.target.value); }} /></div>
                        <div className="field"><label>Ondertitel</label><input value={form.ondertitel || ''} onChange={function (e) { setField('ondertitel', e.target.value); }} /></div>
                        <div className="field"><label>Email</label><input value={form.email || ''} onChange={function (e) { setField('email', e.target.value); }} /></div>
                        <div className="field"><label>Telefoon</label><input value={form.telefoon || ''} onChange={function (e) { setField('telefoon', e.target.value); }} /></div>
                        <div className="field full"><label>Adres</label><input value={form.adres || ''} onChange={function (e) { setField('adres', e.target.value); }} /></div>
                        <div className="field"><label>KVK-nummer</label><input value={form.kvk || ''} onChange={function (e) { setField('kvk', e.target.value); }} /></div>
                        <div className="field"><label>BTW-nummer</label><input value={form.btw || ''} onChange={function (e) { setField('btw', e.target.value); }} /></div>
                        <div className="field"><label>IBAN</label><input value={form.iban || ''} onChange={function (e) { setField('iban', e.target.value); }} /></div>
                    </div>
                </div>
            </div>

            {/* Facturatie */}
            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head"><h3><i className="fa-solid fa-file-invoice" style={{ marginRight: 8, color: 'var(--brand)' }}></i>Facturatie</h3></div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Factuurprefix</label><input value={form.factuur_prefix || ''} onChange={function (e) { setField('factuur_prefix', e.target.value); }} /></div>
                        <div className="field"><label>Offerteprefix</label><input value={form.offerte_prefix || ''} onChange={function (e) { setField('offerte_prefix', e.target.value); }} /></div>
                        <div className="field"><label>Standaard BTW (%)</label><input type="number" value={form.default_btw || 21} onChange={function (e) { setField('default_btw', parseInt(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Betaaltermijn (dagen)</label><input type="number" value={form.betaaltermijn || 14} onChange={function (e) { setField('betaaltermijn', parseInt(e.target.value) || 0); }} /></div>
                        <div className="field"><label>Offerte geldigheid (dagen)</label><input type="number" value={form.offerte_geldig || 30} onChange={function (e) { setField('offerte_geldig', parseInt(e.target.value) || 0); }} /></div>
                    </div>
                </div>
            </div>

            {/* Gegevensoverzicht */}
            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head"><h3><i className="fa-solid fa-database" style={{ marginRight: 8, color: 'var(--brand)' }}></i>Gegevensoverzicht</h3></div>
                <div className="panel-body">
                    <div className="stat-grid">
                        <div className="stat-card">
                            <div className="stat-val">{ev.data.length}</div>
                            <div className="stat-label">Events</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-val">{fac.data.length}</div>
                            <div className="stat-label">Facturen</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-val">{off.data.length}</div>
                            <div className="stat-label">Offertes</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-val">{rec.data.length}</div>
                            <div className="stat-label">Recepten</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-val">{mat.data.length}</div>
                            <div className="stat-label">Materieel</div>
                        </div>
                    </div>
                </div>
            </div>

            <button className="btn btn-brand" onClick={saveSettings} style={{ width: '100%', justifyContent: 'center', padding: 14 }}>
                <i className="fa-solid fa-save"></i> Instellingen Opslaan
            </button>
        </>
    );
}
