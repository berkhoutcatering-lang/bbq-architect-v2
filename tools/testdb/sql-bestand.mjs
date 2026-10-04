// Draait één SQL-bestand op de testdatabase en laat de uitkomst zien
// (gebruikt door `seed` en `proef`). Wat het bestand doet blijft staan.
//
//   node sql-bestand.mjs <bestand.sql> [--vergelijk=<uitvoer-van-live.txt>]
//
// --vergelijk: legt de laatste uitkomst naast een tabel die op live is
// gemaakt (uitvoer van `supabase db query -o table`, of psql), per rij met
// dezelfde eerste twee kolommen (bij de objectproef: soort + naam), en toont
// alleen de verschillen.

import fs from 'node:fs';
import path from 'node:path';
import { beschrijfFout, isHoofd, REPO, toonTabel, verbind } from './lib.mjs';

// Rijen uit een tabel-uitvoer halen: box-tekens (│) of psql (|).
export function leesTabellen(tekst) {
    const tabellen = [];
    let huidig = null;
    for (const regel of tekst.split('\n')) {
        // Lijnen tussen kop en rijen (├──┼──┤ of ---+---) horen bij de tabel.
        if (huidig && /^[\s─┼├┤┬┴┌┐└┘═╪+|-]+$/.test(regel) && /[─-]/.test(regel)) continue;
        const scheider = regel.includes('│') ? '│' : regel.includes(' | ') ? '|' : null;
        if (!scheider) {
            huidig = null;
            continue;
        }
        let cellen = regel.split(scheider).map((c) => c.trim());
        if (scheider === '│') cellen = cellen.slice(1, -1);
        if (!huidig) {
            huidig = { kolommen: cellen, rijen: [] };
            tabellen.push(huidig);
        } else {
            huidig.rijen.push(cellen);
        }
    }
    return tabellen;
}

export function vergelijk(res, liveTekst) {
    const kolommen = res.fields.map((f) => f.name);
    const live = leesTabellen(liveTekst).find((t) => t.kolommen.join('|') === kolommen.join('|'));
    if (!live) return { fout: `Geen tabel met kolommen ${kolommen.join(', ')} gevonden in het live-bestand.` };
    const sleutel = (cellen) => `${cellen[0]} │ ${cellen[1]}`;
    const lokaal = new Map(res.rows.map((r) => [sleutel(kolommen.map((k) => String(r[k] ?? ''))), kolommen.map((k) => String(r[k] ?? ''))]));
    const daar = new Map(live.rijen.map((c) => [sleutel(c), c]));
    const verschillen = [];
    for (const [k, l] of lokaal) {
        const d = daar.get(k);
        if (!d) verschillen.push({ soort: 'alleen lokaal', rij: k, lokaal: l.at(-1), live: '' });
        else if (d.at(-1) !== l.at(-1)) verschillen.push({ soort: 'andere uitkomst', rij: k, lokaal: l.at(-1), live: d.at(-1) });
    }
    for (const [k, d] of daar) {
        if (!lokaal.has(k)) verschillen.push({ soort: 'alleen live', rij: k, lokaal: '', live: d.at(-1) });
    }
    return { verschillen, lokaalAantal: lokaal.size, liveAantal: daar.size };
}

// '@/pad' is relatief aan de repo (of TESTDB_REPO); een gewoon pad relatief
// aan de map waar npm werd aangeroepen.
function zoekBestand(bestand) {
    if (bestand.startsWith('@/')) return path.join(REPO, bestand.slice(2));
    return path.resolve(process.env.INIT_CWD ?? process.cwd(), bestand);
}

async function draai(bestand, vergelijkMet) {
    const pad = zoekBestand(bestand);
    const sql = fs.readFileSync(pad, 'utf8');
    const client = await verbind();
    let resultaten;
    try {
        resultaten = await client.query(sql);
    } catch (e) {
        console.error(`FOUT in ${path.basename(pad)}`);
        console.error(beschrijfFout(e, sql, path.relative(REPO, pad)));
        process.exitCode = 1;
        return;
    } finally {
        await client.end();
    }
    const lijst = (Array.isArray(resultaten) ? resultaten : [resultaten]).filter((r) => r.fields && r.fields.length);
    for (const r of lijst) console.log(toonTabel(r) + '\n');
    const laatste = lijst.at(-1);

    if (laatste && laatste.fields.some((f) => f.name === 'status')) {
        const telling = {};
        for (const r of laatste.rows) telling[r.status] = (telling[r.status] ?? 0) + 1;
        console.log('Samenvatting:', Object.entries(telling).map(([k, v]) => `${v} ${k}`).join(', '));
    }

    if (vergelijkMet && laatste) {
        const uitkomst = vergelijk(laatste, fs.readFileSync(vergelijkMet, 'utf8'));
        if (uitkomst.fout) {
            console.error(uitkomst.fout);
            process.exitCode = 1;
            return;
        }
        console.log(`\nVergelijking met ${path.basename(vergelijkMet)}: ${uitkomst.lokaalAantal} rijen lokaal, ${uitkomst.liveAantal} op live.`);
        if (uitkomst.verschillen.length === 0) {
            console.log('Geen verschillen.');
        } else {
            const nep = {
                fields: ['soort', 'rij', 'lokaal', 'live'].map((name) => ({ name })),
                rows: uitkomst.verschillen,
            };
            console.log(toonTabel(nep));
        }
    }
}

if (isHoofd(import.meta.url)) {
    const args = process.argv.slice(2);
    const bestand = args.find((a) => !a.startsWith('--'));
    const v = args.find((a) => a.startsWith('--vergelijk='));
    if (!bestand) {
        console.error('Gebruik: node sql-bestand.mjs <bestand.sql> [--vergelijk=<live-uitvoer.txt>]');
        process.exit(2);
    }
    draai(bestand, v ? path.resolve(process.env.INIT_CWD ?? process.cwd(), v.slice(12)) : null).catch((e) => {
        console.error(e.message);
        process.exit(1);
    });
}
