/**
 * Van "wat moet erop" naar labels die de printer begrijpt. Draait op de
 * server (de ZPL komt op de printjob te staan) maar is puur, dus ook in tests
 * en op /dev/labels bruikbaar.
 */

import type { LabelBlok, LabelFormaat } from './types';
import { loslabel, type LosLabelData } from './templates/loslabel';
import { productielabel, type ProductielabelData } from './templates/productielabel';
import { testlabel, type TestlabelData } from './templates/testlabel';
import { pastOp } from './templates/index';

export type LabelVerzoek =
    | { soort: 'testlabel'; data: TestlabelData }
    | { soort: 'los_label'; data: LosLabelData; aantal: number }
    | { soort: 'partij_labels' | 'herprint'; labels: Array<{ eenheidId: string; data: ProductielabelData }> };

export interface GerenderdeJob {
    templateCode: string;
    templateVersie: number;
    labels: LabelBlok[];
    waarschuwingen: string[];
    labelData: unknown;
}

export const MAX_LOSSE_LABELS = 50;

export function renderVerzoek(v: LabelVerzoek, formaat: LabelFormaat): GerenderdeJob {
    const waarschuwingen: string[] = [];

    if (v.soort === 'testlabel') {
        if (!pastOp(testlabel, formaat)) waarschuwingen.push('Label is kleiner dan het minimum voor deze template');
        const r = testlabel.render(v.data, formaat);
        return {
            templateCode: testlabel.code, templateVersie: testlabel.versie,
            labels: [{ eenheidId: null, zpl: r.zpl }],
            waarschuwingen: [...waarschuwingen, ...r.waarschuwingen],
            labelData: v.data,
        };
    }

    if (v.soort === 'los_label') {
        if (!pastOp(loslabel, formaat)) waarschuwingen.push('Label is kleiner dan het minimum voor deze template');
        const aantal = Math.max(1, Math.min(MAX_LOSSE_LABELS, Math.floor(v.aantal)));
        const r = loslabel.render(v.data, formaat);
        /* Zelfde inhoud, N keer: hier mag dat, want dit hangt aan niets. */
        const labels: LabelBlok[] = Array.from({ length: aantal }, () => ({ eenheidId: null, zpl: r.zpl }));
        return {
            templateCode: loslabel.code, templateVersie: loslabel.versie,
            labels, waarschuwingen: [...waarschuwingen, ...r.waarschuwingen],
            labelData: { ...v.data, aantal },
        };
    }

    if (!pastOp(productielabel, formaat)) waarschuwingen.push('Label is kleiner dan het minimum voor het productielabel');
    const labels: LabelBlok[] = [];
    for (const l of v.labels) {
        const r = productielabel.render(l.data, formaat);
        for (const w of r.waarschuwingen) waarschuwingen.push(`${l.data.eenheidCode}: ${w}`);
        labels.push({ eenheidId: l.eenheidId, zpl: r.zpl });
    }
    return {
        templateCode: productielabel.code, templateVersie: productielabel.versie,
        labels, waarschuwingen,
        labelData: { partijnummer: v.labels[0]?.data.partijnummer ?? null, aantal: v.labels.length },
    };
}
