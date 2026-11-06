/** PDF van de maandstaat, voor de eigen administratie en het boekhouderpakket. */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatEur } from '@/lib/format';
import type { Maandstaat } from '@/lib/omzetMaandstaat';

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function maandstaatPdf(m: Maandstaat, bedrijfsnaam: string): { base64: string; filename: string } {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', compress: true });
    const periode = `${MAANDEN[m.maand - 1]} ${m.jaar}`;

    doc.setFontSize(16);
    doc.text(`Maandstaat winkelomzet ${periode}`, 40, 44);
    doc.setFontSize(10);
    doc.text(bedrijfsnaam, 40, 60);

    const geld = (n: number | null) => (n === null ? '' : formatEur(n));
    autoTable(doc, {
        startY: 76,
        styles: { fontSize: 8 },
        head: [['Dag', 'Kassa', 'Webshop', 'Oude kassa', 'Omzet 9%', 'Btw 9%', 'Omzet 21%', 'Btw 21%', 'Totaal incl.', 'Pin', 'Contant', 'Kasverschil', 'Dagstaat']],
        body: m.dagen.map((d) => [
            d.datum, geld(d.toonbank), geld(d.webshop), geld(d.kassa_oud), geld(d.omzet_9), geld(d.btw_9), geld(d.omzet_21), geld(d.btw_21),
            geld(d.incl), geld(d.pin), geld(d.contant), geld(d.kasverschil),
            d.dagstaat === 'in_orde' ? 'In orde' : d.dagstaat === 'te_controleren' ? 'Te controleren' : '',
        ]),
        foot: [['Totaal', geld(m.totaal.toonbank), geld(m.totaal.webshop), geld(m.totaal.kassa_oud), geld(m.totaal.omzet_9), geld(m.totaal.btw_9),
            geld(m.totaal.omzet_21), geld(m.totaal.btw_21), geld(m.totaal.incl), geld(m.totaal.pin), geld(m.totaal.contant), geld(m.totaal.kasverschil), '']],
    });

    if (m.open_punten.length > 0) {
        const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
        doc.setFontSize(10);
        doc.text('Nog na te kijken', 40, y);
        doc.setFontSize(9);
        m.open_punten.forEach((p, i) => doc.text(`- ${p}`, 40, y + 14 + i * 12));
    }

    const base64 = doc.output('datauristring').split(',')[1];
    return { base64, filename: `maandstaat-${m.jaar}-${String(m.maand).padStart(2, '0')}.pdf` };
}
