'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import Panel from '@/components/chassis/Panel';
import { useToast } from '@/components/Toast';
import { bewaarSchrijfstijl } from '../actions';

interface Props {
    settingsId: string | number | undefined;
    schrijfstijl: string;
    handtekening: string;
}

/** Hoe concepten klinken. Geldt per bedrijf. */
export default function SchrijfstijlTab({ settingsId, schrijfstijl, handtekening }: Props) {
    const toast = useToast();
    const [stijl, setStijl] = useState(schrijfstijl);
    const [onder, setOnder] = useState(handtekening);
    const [bezig, setBezig] = useState(false);

    async function bewaar() {
        if (settingsId == null) { toast('Vul eerst je bedrijfsgegevens in', 'error'); return; }
        setBezig(true);
        const r = await bewaarSchrijfstijl({ settingsId, schrijfstijl: stijl, handtekening: onder });
        setBezig(false);
        if (r.error) toast(r.error, 'error');
        else toast('Schrijfstijl bewaard', 'success');
    }

    return (
        <Panel title="Hoe je mails klinken">
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
                Concepten volgen wat hier staat. Beschrijf hoe je klanten aanspreekt en plak een paar mails die je zelf schreef.
            </p>
            <div className="field">
                <label>Schrijfstijl</label>
                <textarea value={stijl} onChange={(e) => setStijl(e.target.value)} rows={12} />
            </div>
            <div className="field">
                <label>Handtekening</label>
                <textarea value={onder} onChange={(e) => setOnder(e.target.value)} rows={4} />
            </div>
            <Button variant="brand" loading={bezig} onClick={bewaar}>Bewaar schrijfstijl</Button>
        </Panel>
    );
}
