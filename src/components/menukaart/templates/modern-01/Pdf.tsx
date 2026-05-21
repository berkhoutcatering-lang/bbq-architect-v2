/**
 * Modern-01 PDF — Editorial sidebar layout.
 *
 * Visuele match met `Modern01Preview`:
 *   - Brand-primary sidebar links (220pt) met gang-index
 *   - Main content rechts met massive sans-serif "Menu" title
 *   - Footnote-allergens per gang
 */

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import {
    type PdfTemplateProps,
    mapFontToPdf,
    logoInitials,
    pageSize,
    readEventBlock,
    footerLine,
    pdfContrastColor,
} from '@/lib/menukaart/pdf-shared';
import { formatAllergenLegend, gangAllergens, ALLERGEN_MAP } from '@/lib/menukaart/menu-data';

export default function Modern01Pdf({ overrides, data }: PdfTemplateProps) {
    const accent = overrides.accent ?? '#1A1A1A';
    const bg = overrides.bg ?? '#FFFFFF';
    const text = overrides.text ?? '#1A1A1A';
    const muted = '#777777';
    const headingFontFam = mapFontToPdf(overrides.headingFont);
    const bodyFontFam = mapFontToPdf(overrides.bodyFont);
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? '';
    const eventBlock = readEventBlock(overrides);
    const footer = footerLine(overrides);
    const legend = formatAllergenLegend(data.gangen);
    const initials = logoInitials(brandName);
    const sideText = pdfContrastColor(accent);
    const showFootnote = overrides.showFootnoteAllergens !== false;
    const totalDishes = data.gangen.reduce((s, g) => s + g.dishes.length, 0);
    const { width, height } = pageSize('a4');

    const styles = StyleSheet.create({
        page: { fontFamily: bodyFontFam, color: text, flexDirection: 'row', backgroundColor: bg },
        sidebar: { width: 200, backgroundColor: accent, padding: 24, color: sideText },
        logoFallback: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#ffffff66', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
        logoLetter: { fontSize: 18, color: sideText, fontWeight: 'bold' },
        sideBrand: { fontSize: 16, color: sideText, marginBottom: 3 },
        sideSub: { fontSize: 8, color: sideText, opacity: 0.55, letterSpacing: 1.5, marginBottom: 16 },
        sideRule: { width: 22, height: 1, backgroundColor: '#ffffff33', marginBottom: 14 },
        sideGang: { marginBottom: 14 },
        sideGangNum: { fontFamily: headingFontFam, fontSize: 26, opacity: 0.2, color: sideText, lineHeight: 1 },
        sideGangName: { fontSize: 10, color: sideText, marginTop: 2 },
        sideGangCount: { fontSize: 8, color: sideText, opacity: 0.45, marginTop: 1 },
        sideFooter: { fontSize: 8, color: sideText, opacity: 0.45, marginTop: 'auto', lineHeight: 1.7 },
        main: { flex: 1, padding: 30, paddingBottom: 24 },
        mainHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
        menuTitle: { fontFamily: headingFontFam, fontSize: 40, color: text, fontWeight: 'normal' },
        menuSub: { fontSize: 8, color: muted, letterSpacing: 1.5, marginTop: 4 },
        eventBox: { backgroundColor: bg, borderLeftWidth: 3, borderLeftColor: accent, padding: 10, marginBottom: 14 },
        eventTitle: { fontFamily: headingFontFam, fontSize: 13, color: accent, marginBottom: 2 },
        eventMessage: { fontSize: 9, color: muted, lineHeight: 1.5 },
        gang: { marginBottom: 14 },
        gangHead: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 2 },
        gangNum: { fontFamily: headingFontFam, fontSize: 10, color: accent, letterSpacing: 1, marginRight: 8 },
        gangName: { fontFamily: headingFontFam, fontSize: 14, color: text, letterSpacing: 0.5 },
        gangDesc: { fontSize: 9, color: muted, marginBottom: 5, lineHeight: 1.55, maxWidth: 270 },
        gangRule: { height: 1.5, backgroundColor: accent, marginBottom: 6, opacity: 0.4 },
        dish: { flexDirection: 'row', marginBottom: 4, alignItems: 'baseline' },
        dishBullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: accent, opacity: 0.3, marginTop: 5, marginRight: 6 },
        dishName: { fontSize: 11, color: text },
        dishDesc: { fontSize: 8, color: muted, lineHeight: 1.45, marginTop: 1, marginLeft: 10 },
        footnote: { fontSize: 8, color: muted, marginTop: 3, marginLeft: 10 },
        footnoteCode: { color: accent, fontWeight: 'bold' },
        divider: { height: 1, backgroundColor: '#EDEDED', marginVertical: 6, marginBottom: 14 },
        legend: { borderTopWidth: 2, borderTopColor: accent, paddingTop: 10, marginTop: 'auto' },
        legendLabel: { fontSize: 9, color: accent, letterSpacing: 1.5, marginBottom: 4, fontWeight: 'bold' },
        legendText: { fontSize: 8, color: muted, lineHeight: 1.7 },
        footer: { fontSize: 8, color: '#C8C8C8', marginTop: 6 },
    });

    return (
        <Document title={`Menukaart — ${brandName}`}>
            <Page size={{ width, height }} style={styles.page}>
                <View style={styles.sidebar}>
                    {data.logoUrl ? (
                        <Image src={data.logoUrl} style={{ maxHeight: 44, objectFit: 'contain', marginBottom: 10 }} />
                    ) : (
                        <View style={styles.logoFallback}>
                            <Text style={styles.logoLetter}>{initials}</Text>
                        </View>
                    )}
                    <Text style={styles.sideBrand}>{brandName}</Text>
                    {subtitle ? <Text style={styles.sideSub}>{subtitle.toUpperCase()}</Text> : null}
                    <View style={styles.sideRule} />
                    {data.gangen.map((g, i) => (
                        <View key={i} style={styles.sideGang}>
                            <Text style={styles.sideGangNum}>{String(i + 1).padStart(2, '0')}</Text>
                            <Text style={styles.sideGangName}>{g.name}</Text>
                            <Text style={styles.sideGangCount}>{g.dishes.length} gerechten</Text>
                        </View>
                    ))}
                    <Text style={styles.sideFooter}>
                        {[overrides.addressLine, overrides.email, overrides.website].filter(Boolean).join('\n')}
                    </Text>
                </View>

                <View style={styles.main}>
                    <View style={styles.mainHead}>
                        <Text style={styles.menuTitle}>Menu</Text>
                        <Text style={styles.menuSub}>{data.gangen.length} GANGEN · {totalDishes} GERECHTEN</Text>
                    </View>

                    {eventBlock?.position === 'top' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}

                    {data.gangen.map((gang, gi) => {
                        const used = gangAllergens(gang);
                        return (
                            <View key={gi} wrap={false}>
                                <View style={styles.gang}>
                                    <View style={styles.gangHead}>
                                        <Text style={styles.gangNum}>{String(gi + 1).padStart(2, '0')}</Text>
                                        <Text style={styles.gangName}>{gang.name}</Text>
                                    </View>
                                    {gang.description ? <Text style={styles.gangDesc}>{gang.description}</Text> : null}
                                    <View style={styles.gangRule} />
                                    {gang.dishes.map((dish, di) => (
                                        <View key={di} style={styles.dish}>
                                            <View style={styles.dishBullet} />
                                            <View>
                                                <Text style={styles.dishName}>{dish.name}</Text>
                                                {dish.description ? <Text style={styles.dishDesc}>{dish.description}</Text> : null}
                                            </View>
                                        </View>
                                    ))}
                                    {showFootnote && used.length > 0 && (
                                        <Text style={styles.footnote}>
                                            Bevat: {used.map(a => `${a} ${ALLERGEN_MAP[a]}`).join(', ')}
                                        </Text>
                                    )}
                                </View>
                                {gi < data.gangen.length - 1 && (overrides.showDividers !== false) && <View style={styles.divider} />}
                            </View>
                        );
                    })}

                    {eventBlock?.position === 'bottom' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}

                    <View style={styles.legend}>
                        <Text style={styles.legendLabel}>ALLERGENEN</Text>
                        <Text style={styles.legendText}>{legend || '—'}</Text>
                        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
                    </View>
                </View>
            </Page>
        </Document>
    );
}
