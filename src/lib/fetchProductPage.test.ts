/**
 * De belangrijkste test hier is niet of het ophalen lukt, maar of het NIET lukt
 * waar dat hoort: een geplakte link mag de server nooit naar binnen laten kijken.
 */
import { describe, it, expect } from 'vitest';
import { fetchProductPage, ProductPaginaError } from './fetchProductPage';

async function verwacht(url: string, reden: ProductPaginaError['reden']) {
    await expect(fetchProductPage(url)).rejects.toMatchObject({
        name: 'ProductPaginaError',
        reden,
    });
}

describe('fetchProductPage — het slotje', () => {
    it('weigert je eigen machine', async () => {
        await verwacht('http://localhost:3000/intern', 'geblokkeerd');
        await verwacht('http://127.0.0.1/intern', 'geblokkeerd');
    });

    it('weigert je eigen netwerk', async () => {
        await verwacht('http://192.168.1.1/', 'geblokkeerd');
        await verwacht('http://10.0.0.5/', 'geblokkeerd');
        await verwacht('http://172.16.4.4/', 'geblokkeerd');
    });

    it('weigert cloud-metadata — het klassieke lek', async () => {
        await verwacht('http://169.254.169.254/latest/meta-data/', 'geblokkeerd');
    });

    it('weigert interne hostnamen', async () => {
        await verwacht('http://printer.local/', 'geblokkeerd');
        await verwacht('http://db.internal/', 'geblokkeerd');
    });

    it('weigert wat geen webadres is', async () => {
        await verwacht('ftp://example.com/bestand', 'ongeldig');
        await verwacht('file:///etc/passwd', 'ongeldig');
        await verwacht('gewoon wat tekst', 'ongeldig');
    });

    it('laat een publiek adres wél door de controle', async () => {
        // Niet het ophalen testen (dat vraagt netwerk), maar dat de controle
        // hem niet blokkeert: de fout mag alles zijn behalve 'geblokkeerd'.
        try {
            await fetchProductPage('https://example.com/product');
        } catch (e) {
            expect((e as ProductPaginaError).reden).not.toBe('geblokkeerd');
        }
    });
});
