/**
 * Smokehouse-01 PDF — donker, BBQ-rauw.
 *
 * Visuele match met `Smokehouse01Preview`:
 *   - Charcoal achtergrond, brand-stripe links
 *   - Display-font naar Helvetica-Bold (Oswald-mapping)
 *   - Inline allergens tussen []
 *   - Brand-primary legend-bar onderaan
 */

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import {
    type PdfTemplateProps,
    mapFontToPdf,
    logoInitials,
    pageSize,
    readEventBlock,
    footerLine,
    allergensBracket,
    pdfContrastColor,
} from '@/lib/menukaart/pdf-shared';
import { formatAllergenLegend } from '@/lib/menukaart/menu-data';

export default function Smokehouse01Pdf({ overrides, data }: PdfTemplateProps) {
    const accent = overrides.accent ?? '#D4592A';
    const bg = overrides.bg ?? '#141210';
    const text = overrides.text ?? '#E8E0D0';
    const muted = '#5E5850';
    const headingFontFam = mapFontToPdf(overrides.headingFont);
    const bodyFontFam = mapFontToPdf(overrides.bodyFont);
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? '';
    const eventBlock = readEventBlock(overrides);
    const footer = footerLine(overrides);
    const legend = formatAllergenLegend(data.gangen);
    const initials = logoInitials(brandName);
    const barText = pdfContrastColor(accent);
    const { width, height } = pageSize('a4');

    const styles = StyleSheet.create({
        page: { backgroundColor: bg, fontFamily: bodyFontFam, color: text, position: 'relative' },
        stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: accent },
        content: { padding: 40, paddingLeft: 50, paddingBottom: 60 },
        headerRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: muted, borderBottomStyle: 'dashed', paddingBottom: 12, marginBottom: 14 },
        logoBox: { width: 50, height: 50, borderWidth: 2, borderColor: accent, borderRadius: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
        logoLetter: { fontFamily: headingFontFam, fontSize: 22, color: accent, fontWeight: 'bold' },
        brandName: { fontFamily: headingFontFam, fontSize: 28, color: text, letterSpacing: 2, fontWeight: 'bold' },
        subtitle: { fontFamily: bodyFontFam, fontSize: 8, color: muted, letterSpacing: 1, marginTop: 2 },
        menuLabel: { fontFamily: headingFontFam, fontSize: 10, color: muted, letterSpacing: 5, textAlign: 'center', marginBottom: 14 },
        eventBox: { padding: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: muted, borderStyle: 'dashed', marginBottom: 12, alignItems: 'center' },
        eventTitle: { fontFamily: headingFontFam, fontSize: 13, color: accent, letterSpacing: 1.5, marginBottom: 2 },
        eventMessage: { fontFamily: bodyFontFam, fontSize: 9, color: muted, fontStyle: 'italic', textAlign: 'center', lineHeight: 1.5 },
        gangRow: { flexDirection: 'row', marginBottom: 12 },
        gangBar: { width: 3, backgroundColor: accent, marginRight: 12, borderRadius: 1 },
        gangContent: { flex: 1 },
        gangName: { fontFamily: headingFontFam, fontSize: 18, color: accent, letterSpacing: 1.5, fontWeight: 'bold' },
        gangDesc: { fontFamily: bodyFontFam, fontSize: 9, color: muted, fontStyle: 'italic', marginBottom: 6 },
        dish: { marginBottom: 4 },
        dishRow: { flexDirection: 'row', alignItems: 'baseline' },
        dishDot: { width: 4, height: 4, backgroundColor: accent, opacity: 0.4, marginRight: 6, borderRadius: 2 },
        dishName: { fontFamily: headingFontFam, fontSize: 13, color: text, letterSpacing: 0.5, fontWeight: 'bold' },
        dishAllergens: { fontFamily: bodyFontFam, fontSize: 8, color: accent, marginLeft: 6, letterSpacing: 0.5 },
        dishDesc: { fontFamily: bodyFontFam, fontSize: 8, color: muted, lineHeight: 1.4, marginTop: 1, paddingLeft: 10 },
        dashedDivider: { borderTopWidth: 1, borderTopColor: muted, borderTopStyle: 'dashed', marginVertical: 8, opacity: 0.4 },
        legendBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: accent, paddingVertical: 10, paddingHorizontal: 50, color: barText, flexDirection: 'row', alignItems: 'baseline' },
        legendLabel: { fontFamily: headingFontFam, fontSize: 11, color: barText, letterSpacing: 1, marginRight: 10, fontWeight: 'bold' },
        legendText: { fontFamily: bodyFontFam, fontSize: 8, color: barText, opacity: 0.85, flex: 1, lineHeight: 1.6 },
        footer: { fontFamily: bodyFontFam, fontSize: 7, color: muted, textAlign: 'center', position: 'absolute', bottom: 36, left: 50, right: 20, opacity: 0.6 },
    });

    return (
        <Document title={`Menukaart — ${brandName}`}>
            <Page size={{ width, height }} style={styles.page}>
                <View style={styles.stripe} />
                <View style={styles.content}>
                    <View style={styles.headerRow}>
                        {data.logoUrl ? (
                            <Image src={data.logoUrl} style={{ width: 50, height: 50, objectFit: 'contain', marginRight: 12 }} />
                        ) : (
                            <View style={styles.logoBox}>
                                <Text style={styles.logoLetter}>{initials}</Text>
                            </View>
                        )}
                        <View>
                            <Text style={styles.brandName}>{brandName.toUpperCase()}</Text>
                            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                        </View>
                    </View>

                    <Text style={styles.menuLabel}>M E N U</Text>

                    {eventBlock?.position === 'top' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title.toUpperCase()}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}

                    {data.gangen.map((gang, gi) => (
                        <View key={gi} wrap={false}>
                            <View style={styles.gangRow}>
                                <View style={styles.gangBar} />
                                <View style={styles.gangContent}>
                                    <Text style={styles.gangName}>{gang.name.toUpperCase()}</Text>
                                    {gang.description ? <Text style={styles.gangDesc}>{gang.description}</Text> : null}
                                    {gang.dishes.map((dish, di) => (
                                        <View key={di} style={styles.dish}>
                                            <View style={styles.dishRow}>
                                                <View style={styles.dishDot} />
                                                <Text style={styles.dishName}>{dish.name}</Text>
                                                {allergensBracket(dish.allergens) ? (
                                                    <Text style={styles.dishAllergens}>{allergensBracket(dish.allergens)}</Text>
                                                ) : null}
                                            </View>
                                            {dish.description ? <Text style={styles.dishDesc}>{dish.description}</Text> : null}
                                        </View>
                                    ))}
                                </View>
                            </View>
                            {gi < data.gangen.length - 1 && (overrides.showDividers !== false) && <View style={styles.dashedDivider} />}
                        </View>
                    ))}

                    {eventBlock?.position === 'bottom' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title.toUpperCase()}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}
                </View>

                <View style={styles.legendBar}>
                    <Text style={styles.legendLabel}>ALLERGENEN</Text>
                    <Text style={styles.legendText}>{legend || '—'}</Text>
                </View>
                {footer ? <Text style={styles.footer}>{footer}</Text> : null}
            </Page>
        </Document>
    );
}
