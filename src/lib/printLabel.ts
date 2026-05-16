/**
 * HACCP-label / temperatuur-record sticker-printing — Pillar #4 (Keuken).
 *
 * Twee varianten:
 *   - printHaccpLabel: bestaand productlabel (titel, allergenen, THT-datum).
 *   - printTempRecordLabel: nieuw — kerntemperatuur-meting met audit-info
 *     (chef-naam, check-type, status ok/afwijking). Brother QL-700 of
 *     Web Share API fallback.
 */

interface LabelData {
    titel?: string;
    datum_gemaakt?: string;
    datum_tht?: string;
    allergenen?: string[];
    notities?: string;
}

export interface TempRecordLabelData {
    wat: string;
    temp: number;
    check_type: string; // 'koeling' | 'vriezer' | 'kerntemp' | 'serveer'
    chef?: string | null;
    datum: string;
    tijd: string;
    status: 'ok' | 'afwijking';
    org_naam?: string | null;
    record_id?: number | null;
}

function shareOrDownload(canvas: HTMLCanvasElement, filename: string, shareTitle: string): void {
    try {
        const dataUrl = canvas.toDataURL('image/png');
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)![1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new File([u8arr], filename, { type: mime });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [blob] })) {
            navigator.share({
                title: shareTitle,
                files: [blob],
            }).catch(function () { /* user cancelled */ });
        } else {
            const link = document.createElement('a');
            link.download = filename;
            link.href = dataUrl;
            link.click();
        }
    } catch (e) {
        console.error('Fout bij genereren label image:', e);
    }
}

export function printHaccpLabel(data: LabelData): void {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 400, 300);

    ctx.fillStyle = '#000000';

    // 1. Titel
    ctx.font = 'bold 36px Arial';
    let title = data.titel || 'Onbekend Gerecht';
    if (title.length > 20) title = title.substring(0, 18) + '..';
    ctx.fillText(title, 20, 50);

    ctx.beginPath();
    ctx.moveTo(20, 65);
    ctx.lineTo(380, 65);
    ctx.lineWidth = 3;
    ctx.stroke();

    // 2. Allergenen
    ctx.font = '20px Arial';
    const allerg = data.allergenen && data.allergenen.length > 0 ? data.allergenen.join(', ') : 'Geen';
    ctx.fillText('Allerg: ' + allerg, 20, 100);

    // 3. Notities
    ctx.font = '22px Arial';
    let note = data.notities || 'Geen opslag instructies';
    if (note.length > 35) note = note.substring(0, 32) + '...';
    ctx.fillText(note, 20, 140);

    ctx.beginPath();
    ctx.moveTo(20, 240);
    ctx.lineTo(380, 240);
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Datums
    ctx.font = 'bold 24px Arial';
    const inDate = data.datum_gemaakt || new Date().toISOString().split('T')[0];
    const thtDate = data.datum_tht || 'Zie batch';
    ctx.fillText('In: ' + inDate, 20, 275);

    ctx.textAlign = 'right';
    ctx.fillText('THT: ' + thtDate, 380, 275);

    shareOrDownload(canvas, 'HACCP-Label-BBQ-Architect.png', 'Print HACCP Label');
}

/**
 * Print een temperatuur-record sticker voor HACCP-audit-trail.
 * NVWA-compliant: bevat datum/tijd, wat, kerntemp, chef, check-type,
 * status (ok of afwijking met visuele rode strook).
 */
export function printTempRecordLabel(data: TempRecordLabelData): void {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;

    // Achtergrond + status-strook
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 400, 300);

    // Status-strook bovenaan (8px hoog), groen of rood.
    const statusColor = data.status === 'ok' ? '#16a34a' : '#dc2626';
    ctx.fillStyle = statusColor;
    ctx.fillRect(0, 0, 400, 8);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';

    // 1. Header: check-type + status
    ctx.font = 'bold 22px Arial';
    const checkLabel = ({
        koeling: 'KOELING',
        vriezer: 'VRIEZER',
        kerntemp: 'KERNTEMP',
        serveer: 'SERVEER',
    } as Record<string, string>)[data.check_type] || data.check_type.toUpperCase();
    ctx.fillText(checkLabel, 20, 36);

    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = statusColor;
    ctx.textAlign = 'right';
    ctx.fillText(data.status === 'ok' ? 'OK' : 'AFWIJKING', 380, 36);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';

    ctx.beginPath();
    ctx.moveTo(20, 50);
    ctx.lineTo(380, 50);
    ctx.lineWidth = 2;
    ctx.stroke();

    // 2. Wat
    ctx.font = 'bold 32px Arial';
    let wat = data.wat || 'Onbekend';
    if (wat.length > 18) wat = wat.substring(0, 16) + '..';
    ctx.fillText(wat, 20, 95);

    // 3. Temperatuur (groot, dominant)
    ctx.font = 'bold 64px Arial';
    ctx.fillStyle = statusColor;
    const tempStr = data.temp.toFixed(1) + '°C';
    ctx.fillText(tempStr, 20, 175);

    ctx.fillStyle = '#000000';

    // 4. Chef + tijd
    ctx.font = '18px Arial';
    if (data.chef) {
        ctx.fillText('Chef: ' + data.chef.substring(0, 20), 20, 210);
    }

    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(data.tijd, 380, 210);
    ctx.textAlign = 'left';

    // Footer-streep
    ctx.beginPath();
    ctx.moveTo(20, 245);
    ctx.lineTo(380, 245);
    ctx.lineWidth = 1;
    ctx.stroke();

    // 5. Datum + org + record-id (audit-trail)
    ctx.font = '14px Arial';
    ctx.fillText(data.datum, 20, 270);

    ctx.textAlign = 'right';
    const orgPart = data.org_naam ? data.org_naam.substring(0, 22) : 'BBQ Architect';
    ctx.fillText(orgPart, 380, 270);
    ctx.textAlign = 'left';

    if (data.record_id != null) {
        ctx.font = '11px Arial';
        ctx.fillStyle = '#666666';
        ctx.fillText('Record #' + data.record_id, 20, 290);
        ctx.fillStyle = '#000000';
    }

    shareOrDownload(
        canvas,
        `HACCP-Temp-${data.wat.replace(/[^a-zA-Z0-9]/g, '_')}-${data.datum}.png`,
        'Print HACCP Temp Record',
    );
}
