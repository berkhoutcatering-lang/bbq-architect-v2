export function printHaccpLabel(data) {
    // data: { titel, datum_gemaakt, datum_tht, allergenen, notities }

    // Create a hidden iframe for printing
    var iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    var doc = iframe.contentWindow.document;

    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                /* Critical: Set physical page size to 40mm x 30mm */
                @page { margin: 0; size: 40mm 30mm; }
                body {
                    margin: 0;
                    padding: 0;
                    width: 40mm;
                    height: 30mm;
                    font-family: Arial, sans-serif;
                    background: white;
                    color: black;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-start;
                }
                .label-container {
                    width: 100%;
                    height: 100%;
                    box-sizing: border-box;
                    padding: 2mm 3mm;
                    border: 1px solid transparent; 
                    display: flex;
                    flex-direction: column;
                }
                .title {
                    font-size: 10px;
                    font-weight: bold;
                    text-transform: uppercase;
                    line-height: 1.1;
                    margin-bottom: 2px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .meta {
                    font-size: 8px;
                    margin-bottom: 2px;
                    line-height: 1;
                }
                .meta span {
                    display: inline-block;
                    margin-right: 4px;
                }
                .date-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 8px;
                    font-weight: bold;
                    margin-top: 2px;
                    border-top: 1px solid black;
                    padding-top: 2px;
                }
                .divider {
                    border-top: 1px dotted black;
                    margin: 2px 0;
                }
                .notes {
                    font-size: 7px;
                    line-height: 1.1;
                    overflow: hidden;
                    flex-grow: 1;
                }
            </style>
        </head>
        <body>
            <div class="label-container">
                <div class="title">${data.titel || 'Onbekend Gerecht'}</div>
                <div class="meta">
                    <strong>Allerg:</strong> ${data.allergenen ? data.allergenen.join(', ') : 'Geen'}
                </div>
                <div class="notes">
                    ${data.notities || 'Geen opslag instructies'}
                </div>
                <div class="date-row">
                    <span>In: ${data.datum_gemaakt || new Date().toISOString().split('T')[0]}</span>
                    <span>THT: ${data.datum_tht || 'Zie batch'}</span>
                </div>
            </div>
        </body>
        </html>
    `);
    doc.close();

    // Wait for the iframe to load, then print it, then remove it
    iframe.onload = function () {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);
    };
}
