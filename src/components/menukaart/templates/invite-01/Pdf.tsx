/**
 * Invite-01 PDF — 21×21cm trouwkaart-feel, monogram, ornament border.
 *
 * SVG-corner-ornamenten uit Preview vervangen door geleende dubbele
 * inner border + diamond-divider tekst.
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

export default function Invite01Pdf({ overrides, data }: PdfTemplateProps) {
    const accent = overrides.accent ?? '#7C5234';
    const bg = overrides.bg ?? '#F9F5EC';
    const text = overrides.text ?? '#2A2520';
    const muted = '#A09890';
    const light = '#D4CCB8';
    const headingFontFam = mapFontToPdf(overrides.headingFont);
    const bodyFontFam = mapFontToPdf(overrides.bodyFont);
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? '';
    const eventBlock = readEventBlock(overrides);
    const footer = footerLine(overrides);
    const legend = formatAllergenLegend(data.gangen);
    const initial = logoInitials(brandName).charAt(0);
    const showOrnament = overrides.showOrnament !== false;
    const showFootnote = overrides.showFootnoteAllergens !== false;
    const { width, height } = pageSize('square');

    const styles = StyleSheet.create({
        page: { backgroundColor: bg, fontFamily: bodyFontFam, color: text, padding: 32 },
        outerFrame: { position: 'absolute', top: 14, left: 14, right: 14, bottom: 14, borderWidth: 1, borderColor: accent, opacity: 0.3, borderRadius: 1 },
        innerFrame: { position: 'absolute', top: 18, left: 18, right: 18, bottom: 18, borderWidth: 0.5, borderColor: accent, opacity: 0.5 },
        content: { padding: 22, alignItems: 'center', flex: 1 },
        monogram: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: accent, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
        monogramLetter: { fontFamily: headingFontFam, fontSize: 22, color: accent },
        brandName: { fontFamily: headingFontFam, fontSize: 20, color: text, letterSpacing: 1 },
        subtitle: { fontFamily: headingFontFam, fontSize: 9, fontStyle: 'italic', color: muted, marginTop: 2 },
        ornDivider: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
        ornLine: { width: 30, height: 1, backgroundColor: accent, opacity: 0.4 },
        ornDot: { width: 5, height: 5, backgroundColor: accent, opacity: 0.4, marginHorizontal: 4 },
        menuLabel: { fontFamily: headingFontFam, fontSize: 12, fontStyle: 'italic', color: accent, letterSpacing: 2.5, marginBottom: 6 },
        eventBox: { alignItems: 'center', marginBottom: 6 },
        eventTitle: { fontFamily: headingFontFam, fontSize: 13, fontStyle: 'italic', color: accent, marginBottom: 1 },
        eventMessage: { fontFamily: headingFontFam, fontSize: 9, fontStyle: 'italic', color: muted, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 },
        grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', flex: 1, width: '100%' },
        gangCard: { width: '48%', alignItems: 'center', marginBottom: 8 },
        gangName: { fontFamily: headingFontFam, fontSize: 14, fontStyle: 'italic', color: accent, marginBottom: 2 },
        gangDesc: { fontFamily: headingFontFam, fontSize: 8, fontStyle: 'italic', color: muted, lineHeight: 1.45, textAlign: 'center', marginBottom: 3 },
        gangHair: { width: 18, height: 0.5, backgroundColor: accent, opacity: 0.5, marginBottom: 3 },
        dish: { alignItems: 'center', marginBottom: 2 },
        dishName: { fontFamily: headingFontFam, fontSize: 11, color: text },
        dishDesc: { fontFamily: headingFontFam, fontSize: 8, fontStyle: 'italic', color: muted, textAlign: 'center' },
        footnote: { fontFamily: headingFontFam, fontSize: 8, fontStyle: 'italic', color: muted, marginTop: 3 },
        legend: { alignItems: 'center', marginTop: 'auto', paddingTop: 6 },
        legendText: { fontFamily: headingFontFam, fontSize: 8, fontStyle: 'italic', color: muted, textAlign: 'center', lineHeight: 1.55 },
        footer: { fontSize: 8, color: light, marginTop: 3 },
    });

    return (
        <Document title={`Menukaart — ${brandName}`}>
            <Page size={{ width, height }} style={styles.page}>
                {showOrnament && (
                    <>
                        <View style={styles.outerFrame} />
                        <View style={styles.innerFrame} />
                    </>
                )}
                <View style={styles.content}>
                    {data.logoUrl ? (
                        <Image src={data.logoUrl} style={{ width: 50, height: 50, borderRadius: 25, marginBottom: 5, objectFit: 'contain' }} />
                    ) : (
                        <View style={styles.monogram}>
                            <Text style={styles.monogramLetter}>{initial}</Text>
                        </View>
                    )}
                    <Text style={styles.brandName}>{brandName}</Text>
                    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

                    <View style={styles.ornDivider}>
                        <View style={styles.ornLine} />
                        <View style={styles.ornDot} />
                        <View style={styles.ornLine} />
                    </View>

                    <Text style={styles.menuLabel}>M E N U</Text>

                    {eventBlock?.position === 'top' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}

                    <View style={styles.grid}>
                        {data.gangen.map((gang, gi) => {
                            const used = gangAllergens(gang);
                            return (
                                <View key={gi} style={styles.gangCard} wrap={false}>
                                    <Text style={styles.gangName}>{gang.name}</Text>
                                    {gang.description ? <Text style={styles.gangDesc}>{gang.description}</Text> : null}
                                    <View style={styles.gangHair} />
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
                        <Text style={styles.legendText}>{legend || ''}</Text>
                        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
                    </View>
                </View>
            </Page>
        </Document>
    );
}
