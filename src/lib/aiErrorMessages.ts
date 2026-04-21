// Mapper van PostgreSQL errcodes en Supabase error-shapes naar begrijpelijke
// Nederlandse boodschappen voor de AI-chat. "❌ Mislukt: new row violates
// row-level security policy" is voor eindgebruikers niet bruikbaar — dit
// maakt er "❌ Je hebt geen rechten op deze organisatie" van.

export interface SupabaseLikeError {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
}

interface Explanation {
    message: string;
    hint?: string;
}

// Extract kolomnaam uit een message als "column gerechten.naam..." of
// "Key (id)=(5) is not present in table...".
function extractColumn(msg: string): string | null {
    const m1 = msg.match(/column\s+"?([a-z_]+)\.([a-z_]+)"?/i);
    if (m1) return m1[2];
    const m2 = msg.match(/Key \(([a-z_]+)\)/i);
    if (m2) return m2[1];
    return null;
}

function extractTable(msg: string): string | null {
    const m = msg.match(/table\s+"?(?:public\.)?([a-z_]+)"?/i);
    return m ? m[1] : null;
}

export function explainDbError(err: unknown): Explanation {
    if (!err) return { message: 'Onbekende fout' };
    const e = err as SupabaseLikeError & { message?: string };
    const code = e.code || '';
    const rawMsg = e.message || String(err);

    if (code === '42501' || /row-level security/i.test(rawMsg)) {
        return {
            message: 'Je hebt geen rechten om dit te doen binnen deze organisatie.',
            hint: 'Log opnieuw in of vraag een Admin om je rol te verhogen.',
        };
    }

    if (code === '23503') {
        // FK violation: "Key is not present in table X"
        const tbl = (e.details && extractTable(e.details)) || extractTable(rawMsg);
        const col = (e.details && extractColumn(e.details)) || extractColumn(rawMsg);
        if (tbl === 'gangen' || col === 'gang_slug') {
            return {
                message: 'De opgegeven gang bestaat niet.',
                hint: 'Bekende gangen: voorgerechten, hoofdgerechten, desserts, bites.',
            };
        }
        return {
            message: 'Verwijzing naar ' + (tbl || 'een andere tabel') + ' is ongeldig.',
            hint: 'De gerelateerde rij bestaat niet (meer).',
        };
    }

    if (code === '23505') {
        const col = extractColumn(rawMsg) || extractColumn(e.details || '');
        return {
            message: 'Deze waarde bestaat al' + (col ? ' (' + col + ')' : '') + '.',
            hint: 'Kies een unieke naam of nummer.',
        };
    }

    if (code === '23502') {
        const col = extractColumn(rawMsg);
        return {
            message: 'Verplicht veld ' + (col || 'onbekend') + ' ontbreekt.',
            hint: 'Vul alle verplichte gegevens in en probeer opnieuw.',
        };
    }

    if (code === '22P02') {
        return {
            message: 'Een waarde heeft het verkeerde type (bv. tekst waar een getal verwacht werd).',
        };
    }

    if (code === 'PGRST116') {
        return { message: 'Geen rij gevonden die aan de zoekcriteria voldoet.' };
    }

    if (code === 'PGRST200') {
        return {
            message: 'Kon relatie tussen tabellen niet vinden.',
            hint: 'Waarschijnlijk een schema-fout — neem contact op met support.',
        };
    }

    if (code === '429' || /rate limit/i.test(rawMsg)) {
        return {
            message: 'AI-quota tijdelijk bereikt.',
            hint: 'Probeer het over een minuut opnieuw.',
        };
    }

    // Fallback
    return {
        message: rawMsg.length > 200 ? rawMsg.slice(0, 200) + '…' : rawMsg,
    };
}

export function formatDbError(err: unknown): string {
    const exp = explainDbError(err);
    return exp.hint ? exp.message + ' ' + exp.hint : exp.message;
}
