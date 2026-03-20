export function printHaccpLabel(data) {
    // data: { titel, datum_gemaakt, datum_tht, allergenen, notities }

    // We tekenen de label op een canvas van 400x300 pixels (40x30mm verhouding)
    var canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    var ctx = canvas.getContext('2d');

    // Witte achtergrond
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 400, 300);

    // Zwarte tekst (Thermische printer)
    ctx.fillStyle = '#000000';

    // 1. Titel (Groot & Vet)
    ctx.font = 'bold 36px Arial';
    // Knip lange titels af
    var title = data.titel || 'Onbekend Gerecht';
    if (title.length > 20) title = title.substring(0, 18) + '..';
    ctx.fillText(title, 20, 50);

    // Lijn eronder
    ctx.beginPath();
    ctx.moveTo(20, 65);
    ctx.lineTo(380, 65);
    ctx.lineWidth = 3;
    ctx.stroke();

    // 2. Allergenen
    ctx.font = '20px Arial';
    var allerg = data.allergenen && data.allergenen.length > 0 ? data.allergenen.join(', ') : 'Geen';
    ctx.fillText('Allerg: ' + allerg, 20, 100);

    // 3. Notities (bijv instructies / weight)
    ctx.font = '22px Arial';
    var note = data.notities || 'Geen opslag instructies';
    if (note.length > 35) note = note.substring(0, 32) + '...';
    ctx.fillText(note, 20, 140);

    // Lijn boven datum
    ctx.beginPath();
    ctx.moveTo(20, 240);
    ctx.lineTo(380, 240);
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Datums (Gemaakt & THT)
    ctx.font = 'bold 24px Arial';
    var inDate = data.datum_gemaakt || new Date().toISOString().split('T')[0];
    var thtDate = data.datum_tht || 'Zie batch';
    ctx.fillText('In: ' + inDate, 20, 275);

    // Align rechts voor THT
    ctx.textAlign = 'right';
    ctx.fillText('THT: ' + thtDate, 380, 275);

    try {
        // Synchronous Base64 URL creation keeps the iOS User Gesture alive!
        var dataUrl = canvas.toDataURL('image/png');

        // Convert Base64 to Blob synchronously in memory
        var arr = dataUrl.split(',');
        var mime = arr[0].match(/:(.*?);/)[1];
        var bstr = atob(arr[1]);
        var n = bstr.length;
        var u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        var blob = new File([u8arr], 'HACCP-Label-BBQ-Architect.png', { type: mime });

        // 5. Trigger Web Share API for iOS/Android
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [blob] })) {
            navigator.share({
                title: 'Print HACCP Label',
                text: 'HACCP Label voor Eleph-Label',
                files: [blob]
            }).catch(function (error) {
                console.log('Error sharing:', error);
            });
        } else {
            // Fallback: download direct as file on desktops
            var link = document.createElement('a');
            link.download = 'HACCP-Label-BBQ-Architect.png';
            link.href = dataUrl;
            link.click();
        }
    } catch (e) {
        console.error("Fout bij genereren label image:", e);
        alert('Kan label niet delen/downloaden op dit apparaat.');
    }
}
