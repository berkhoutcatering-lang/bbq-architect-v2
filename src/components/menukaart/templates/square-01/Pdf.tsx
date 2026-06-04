/**
 * Square-01 PDF — 21×21cm Foodtruck. Geen complexe diagonal-band
 * (zou een Svg-transform nodig hebben); vervangen door brand-primary
 * top-band horizontal.
 */

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import {
    type PdfTemplateProps,
    mapFontToPdf,
    logoInitials,
    pageSize,
    readEventBlock,
    footerLine,
    allergensInline,
    pdfContrastColor,
} from '@/lib/menukaart/pdf-shared';
import { formatAllergenLegend } from '@/lib/menukaart/menu-data';

export default function Square01Pdf({ overrides, data }: PdfTemplateProps) {
    const accent = overrides.accent ?? '#E63946';
    const bg = overrides.bg ?? '#FFFBF4';
    const text = overrides.text ?? '#1A1614';
    const muted = '#7A6E5E';
    const warm = '#FFF3E0';
    const headingFontFam = mapFontToPdf(overrides.headingFont);
    const bodyFontFam = mapFontToPdf(overrides.bodyFont);
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? '';
    const eventBlock = readEventBlock(overrides);
    const footer = footerLine(overrides);
    const legend = formatAllergenLegend(data.gangen);
    const initial = logoInitials(brandName).charAt(0);
    const barText = pdfContrastColor(accent);
    const { width, height } = pageSize('square');

    const styles = StyleSheet.create({
        page: { backgroundColor: bg, fontFamily: bodyFontFam, color: text },
        topBand: { backgroundColor: accent, paddingVertical: 14, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', color: barText },
        logoBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff2e', borderWidth: 1.5, borderColor: '#ffffff4d', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
        logoLetter: { fontFamily: headingFontFam, fontSize: 16, color: barText, fontWeight: 'bold' },
        brandName: { fontFamily: headingFontFam, fontSize: 18, color: barText, letterSpacing: 0.5, fontWeight: 'bold' },
        subtitle: { fontSize: 8, color: barText, opacity: 0.7, letterSpacing: 1.5, marginTop: 1 },
        content: { padding: 22, paddingBottom: 50, flex: 1 },
        menuLabel: { fontFamily: headingFontFam, fontSize: 28, color: text, fontWeight: 'bold', marginBottom: 8 },
        eventBox: { backgroundColor: `${accent}1A`, borderLeftWidth: 3, borderLeftColor: accent, padding: 8, marginBottom: 10 },
        eventTitle: { fontFamily: headingFontFam, fontSize: 13, color: accent, fontWeight: 'bold', marginBottom: 1 },
        eventMessage: { fontSize: 9, color: muted, lineHeight: 1.45 },
        gridRow: { flexDirection: 'row', marginBottom: 6 },
        gridCol: { flex: 1, marginRight: 8 },
        gangTag: { backgroundColor: accent, color: barText, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 9, fontFamily: headingFontFam, fontSize: 9, fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 4, alignSelf: 'flex-start' },
        gangDesc: { fontSize: 8, color: muted, fontStyle: 'italic', marginBottom: 3, lineHeight: 1.3 },
        dish: { backgroundColor: warm, borderRadius: 5, paddingVertical: 4, paddingHorizontal: 6, paddingLeft: 9, marginBottom: 3, borderLeftWidth: 2, borderLeftColor: accent },
        dishTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
        dishName: { fontFamily: headingFontFam, fontSize: 10, color: text, fontWeight: 'bold' },
        dishAllergens: { fontSize: 7, color: accent, fontWeight: 'bold', marginLeft: 4 },
        dishDesc: { fontSize: 7, color: muted, lineHeight: 1.3, marginTop: 1 },
        botStrip: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, backgroundColor: accent, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', color: barText },
        botLabel: { fontFamily: headingFontFam, fontSize: 9, color: barText, letterSpacing: 1, fontWeight: 'bold', marginRight: 8 },
        botItems: { fontSize: 7, color: barText, opacity: 0.7, flex: 1, lineHeight: 1.4 },
        footer: { position: 'absolute', bottom: 36, left: 22, fontSize: 7, color: muted },
    });

    // Verdeel gangen in 2-koloms grid (paren)
    const pairs: typeof data.gangen[] = [];
    for (let i = 0; i < data.gangen.length; i += 2) {
        pairs.push(data.gangen.slice(i, i + 2));
    }

    return (
        <Document title={`Menukaart — ${brandName}`}>
            <Page size={{ width, height }} style={styles.page}>
                <View style={styles.topBand}>
                    {data.logoUrl ? (
                        <Image src={data.logoUrl} style={{ width: 36, height: 36, marginRight: 10, objectFit: 'contain' }} />
                    ) : (
                        <View style={styles.logoBox}>
                            <Text style={styles.logoLetter}>{initial}</Text>
                        </View>
                    )}
                    <View>
                        <Text style={styles.brandName}>{brandName}</Text>
                        {subtitle ? <Text style={styles.subtitle}>{subtitle.toUpperCase()}</Text> : null}
                    </View>
                </View>

                <View style={styles.content}>
                    <Text style={styles.menuLabel}>Menu</Text>

                    {eventBlock?.position === 'top' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}

                    {pairs.map((pair, pi) => (
                        <View key={pi} style={styles.gridRow}>
                            {pair.map((gang, gi) => (
                                <View key={gi} style={styles.gridCol} wrap={false}>
                                    <Text style={styles.gangTag}>{gang.name.toUpperCase()}</Text>
                                    {gang.description ? <Text style={styles.gangDesc}>{gang.description}</Text> : null}
                                    {gang.dishes.map((dish, di) => (
                                        <View key={di} style={styles.dish}>
                                            <View style={styles.dishTop}>
                                                <Text style={styles.dishName}>{dish.name}</Text>
                                                {allergensInline(dish.allergens) ? (
                                                    <Text style={styles.dishAllergens}>{allergensInline(dish.allergens)}</Text>
                                                ) : null}
                                            </View>
                                            {dish.description ? <Text style={styles.dishDesc}>{dish.description}</Text> : null}
                                        </View>
                                    ))}
                                </View>
                            ))}
                            {pair.length === 1 && <View style={styles.gridCol} />}
                        </View>
                    ))}

                    {eventBlock?.position === 'bottom' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}
                </View>

                {legend ? (
                    <View style={styles.botStrip}>
                        <Text style={styles.botLabel}>ALLERGENEN</Text>
                        <Text style={styles.botItems}>{legend}</Text>
                    </View>
                ) : null}
                {footer ? <Text style={styles.footer}>{footer}</Text> : null}
            </Page>
        </Document>
    );
}
