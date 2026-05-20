'use client';
import { useState } from 'react';
import { Copy, CheckCircle2 } from 'lucide-react';

/* Kleine client-component: copy-to-clipboard met visuele bevestiging.
   Gesplitst van de server-component EmailInboxCard zodat die laatste
   volledig SSR kan zijn (geen 'use client' overhead). */

export default function EmailInboxCopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard kan in private mode of geweigerde permissions falen
               — geen toast nodig, de gebruiker ziet dat het icoon niet wisselt
               en kan handmatig selecteren. */
        }
    }

    return (
        <button
            type="button"
            onClick={copy}
            aria-label="Kopieer email-adres"
            style={{
                padding: '6px 10px', borderRadius: 6,
                background: copied ? 'rgba(16,185,129,.12)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${copied ? 'rgba(16,185,129,.4)' : 'var(--border)'}`,
                color: copied ? '#10b981' : 'var(--muted)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                minHeight: 32, transition: 'all .15s',
            }}
        >
            {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
            {copied ? 'Gekopieerd' : 'Kopieer'}
        </button>
    );
}
