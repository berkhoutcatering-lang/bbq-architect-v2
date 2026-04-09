interface LabelData {
    titel?: string;
    datum_gemaakt?: string;
    datum_tht?: string;
    allergenen?: string[];
    notities?: string;
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
        const blob = new File([u8arr], 'HACCP-Label-BBQ-Architect.png', { type: mime });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [blob] })) {
            navigator.share({
                title: 'Print HACCP Label',
                text: 'HACCP Label voor Eleph-Label',
                files: [blob]
            }).catch(function () { });
        } else {
            const link = document.createElement('a');
            link.download = 'HACCP-Label-BBQ-Architect.png';
            link.href = dataUrl;
            link.click();
        }
    } catch (e) {
        console.error("Fout bij genereren label image:", e);
        alert('Kan label niet delen/downloaden op dit apparaat.');
    }
}
