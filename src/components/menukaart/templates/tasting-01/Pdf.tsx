/**
 * Tasting-01 PDF — fine-dining, vereenvoudigde timeline (geen diamond-nodes).
 *
 * @react-pdf positie-overlay support is beperkt, dus de visuele timeline
 * met diamond-nodes wordt vereenvoudigd naar genummerde cards op een
 * verticale lijn.
 */

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import {
    type PdfTemplateProps,
    mapFontToPdf,
    logoInitials,
    pageSize,
    readEventBlock,
    footerLine,
} from '@/lib/menukaart/pdf-shared';
import { formatAllergenLegend, gangAllergens, ALLERGEN_MAP } from '@/lib/menukaart/menu-data';

export default function Tasting01Pdf({ overrides, data }: PdfTemplateProps) {
    const accent = overrides.accent ?? '#9e781c';
    const bg = overrides.bg ?? '#F6F2E8';
    const text = overrides.text ?? '#1A1814';
    const muted = '#8A8478';
    const light = '#C8C0B0';
    const tint = '#EDE8DA';
    const headingFontFam = mapFontToPdf(overrides.headingFont);
    const bodyFontFam = mapFontToPdf(overrides.bodyFont);
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? '';
    const eventBlock = readEventBlock(overrides);
    const footer = footerLine(overrides);
    const legend = formatAllergenLegend(data.gangen);
    const initial = logoInitials(brandName).charAt(0);
    const showFootnote = overrides.showFootnoteAllergens !== false;
    const { width, height } = pageSize('a4');

    const styles = StyleSheet.create({
        page: { backgroundColor: bg, fontFamily: bodyFontFam, color: text, padding: 46, paddingBottom: 30 },
        header: { alignItems: 'center', marginBottom: 14 },
        logoCircle: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: accent, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
        logoLetter: { fontFamily: headingFontFam, fontSize: 20, color: accent, fontWeight: 'bold' },
        brandName: { fontFamily: headingFontFam, fontSize: 12, color: text, letterSpacing: 3, fontWeight: 'bold' },
        subtitle: { fontFamily: headingFontFam, fontSize: 9, fontStyle: 'italic', color: muted, marginTop: 3 },
        rule: { width: 30, height: 1, backgroundColor: accent, marginVertical: 12 },
        menuWord: { fontFamily: headingFontFam, fontSize: 36, color: accent, fontStyle: 'italic', letterSpacing: 1.5, fontWeight: 'bold' },
        eventBox: { alignItems: 'center', marginBottom: 10 },
        eventTitle: { fontFamily: headingFontFam, fontSize: 14, fontStyle: 'italic', color: accent, marginBottom: 2 },
        eventMessage: { fontFamily: headingFontFam, fontSize: 9, fontStyle: 'italic', color: muted, textAlign: 'center', maxWidth: 360, lineHeight: 1.5 },
        timeline: { flex: 1, marginBottom: 14 },
        gangCard: { backgroundColor: tint, padding: 10, marginBottom: 8, borderRadius: 3, borderLeftWidth: 1, borderLeftColor: accent },
        gangCardRight: { backgroundColor: tint, padding: 10, marginBottom: 8, borderRadius: 3, borderRightWidth: 1, borderRightColor: accent, alignItems: 'flex-end' },
        gangNum: { fontFamily: headingFontFam, fontSize: 22, color: accent, fontWeight: 'bold' },
        gangName: { fontFamily: headingFontFam, fontSize: 15, fontStyle: 'italic', color: text, letterSpacing: 0.5 },
        gangDesc: { fontFamily: headingFontFam, fontSize: 9, fontStyle: 'italic', color: muted, marginVertical: 3, lineHeight: 1.5 },
        dish: { marginBottom: 2 },
        dishName: { fontFamily: headingFontFam, fontSize: 11, color: text, letterSpacing: 0.5 },
        dishDesc: { fontFamily: headingFontFam, fontSize: 8, fontStyle: 'italic', color: muted },
        footnote: { fontSize: 8, color: muted, fontStyle: 'italic', marginTop: 4 },
        legend: { alignItems: 'center', paddingTop: 8 },
        legendRule: { width: 30, height: 1, backgroundColor: accent, marginBottom: 6 },
        legendLabel: { fontSize: 9, color: accent, letterSpacing: 1.5, fontWeight: 'bold', marginBottom: 3 },
        legendText: { fontSize: 8, color: muted, textAlign: 'center', lineHeight: 1.7 },
        footer: { fontSize: 7, color: light, marginTop: 6 },
    });

    return (
        <Document title={`Menukaart — ${brandName}`}>
            <Page size={{ width, height }} style={styles.page}>
                <View style={styles.header}>
                    {data.logoUrl ? (
                        <Image src={data.logoUrl} style={{ width: 52, height: 52, marginBottom: 6, objectFit: 'contain' }} />
                    ) : (
                        <View style={styles.logoCircle}>
                            <Text style={styles.logoLetter}>{initial}</Text>
                        </View>
                    )}
                    <Text style={styles.brandName}>{brandName.toUpperCase()}</Text>
                    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                    <View style={styles.rule} />
                    <Text style={styles.menuWord}>Menu</Text>
                </View>

                {eventBlock?.position === 'top' && (
                    <View style={styles.eventBox}>
                        {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                        {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                    </View>
                )}

                <View style={styles.timeline}>
                    {data.gangen.map((gang, gi) => {
                        const isLeft = gi % 2 === 0;
                        const num = String(gi + 1).padStart(2, '0');
                        const used = gangAllergens(gang);
                        return (
                            <View key={gi} style={isLeft ? styles.gangCard : styles.gangCardRight} wrap={false}>
                                <Text style={styles.gangNum}>{num}</Text>
                                <Text style={styles.gangName}>{gang.name}</Text>
                                {gang.description ? <Text style={styles.gangDesc}>{gang.description}</Text> : null}
                                {gang.dishes.map((dish, di) => (
                                    <View key={di} style={styles.dish}>
                                        <Text style={styles.dishName}>{dish.name}</Text>
                                        {dish.description ? <Text style={styles.dishDesc}>{dish.description}</Text> : null}
                                    </View>
                                ))}
                                {showFootnote && used.length > 0 && (
                                    <Text style={styles.footnote}>Bevat: {used.map(a => ALLERGEN_MAP[a]).join(', ')}</Text>
                                )}
                            </View>
                        );
                    })}
                </View>

                {eventBlock?.position === 'bottom' && (
                    <View style={styles.eventBox}>
                        {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                        {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                    </View>
                )}

                <View style={styles.legend}>
                    {legend ? (
                        <>
                            <View style={styles.legendRule} />
                            <Text style={styles.legendLabel}>ALLERGENEN</Text>
                            <Text style={styles.legendText}>{legend}</Text>
                        </>
                    ) : null}
                    {footer ? <Text style={styles.footer}>{footer}</Text> : null}
                </View>
            </Page>
        </Document>
    );
}
