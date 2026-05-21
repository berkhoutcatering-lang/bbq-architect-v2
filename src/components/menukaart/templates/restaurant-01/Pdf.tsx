/**
 * Restaurant-01 PDF — server-side gerenderd via @react-pdf/renderer.
 *
 * Visuele match met `Restaurant01Preview`:
 *   - Cream-papier achtergrond, centered layout
 *   - Cirkel-logo met initials in brand-accent
 *   - Brand-name in serif (mapped naar Times-Roman in PDF)
 *   - Gang-headers met eyebrow ("GANG 01") + serif-italic naam
 *   - Inline allergens per gerecht
 *   - Allergen-legenda onderaan
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
} from '@/lib/menukaart/pdf-shared';
import { formatAllergenLegend } from '@/lib/menukaart/menu-data';

export default function Restaurant01Pdf({ overrides, data }: PdfTemplateProps) {
    const accent = overrides.accent ?? '#9e781c';
    const bg = overrides.bg ?? '#FAF6EF';
    const text = overrides.text ?? '#2A2520';
    const headingFontFam = mapFontToPdf(overrides.headingFont);
    const bodyFontFam = mapFontToPdf(overrides.bodyFont);
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? '';
    const eventBlock = readEventBlock(overrides);
    const footer = footerLine(overrides);
    const legend = formatAllergenLegend(data.gangen);
    const initials = logoInitials(brandName);
    const { width, height } = pageSize('a4');

    const styles = StyleSheet.create({
        page: { padding: 56, paddingBottom: 40, backgroundColor: bg, fontFamily: bodyFontFam, color: text },
        headerWrap: { alignItems: 'center', marginBottom: 10 },
        logoCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: accent, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
        logoLetter: { fontFamily: headingFontFam, fontSize: 22, color: accent },
        brandName: { fontFamily: headingFontFam, fontSize: 22, color: text, letterSpacing: 1, marginBottom: 2 },
        subtitle: { fontFamily: bodyFontFam, fontSize: 8, color: '#8A847B', letterSpacing: 2 },
        menuLabel: { fontFamily: bodyFontFam, fontSize: 9, color: accent, textAlign: 'center', letterSpacing: 2, marginTop: 14, marginBottom: 4 },
        divider: { width: 120, height: 1, backgroundColor: accent, opacity: 0.45, alignSelf: 'center', marginVertical: 10 },
        eventBox: { alignSelf: 'center', borderTopWidth: 0.5, borderBottomWidth: 0.5, borderTopColor: accent, borderBottomColor: accent, paddingVertical: 6, paddingHorizontal: 14, marginVertical: 8, maxWidth: 360 },
        eventTitle: { fontFamily: headingFontFam, fontSize: 12, color: accent, textAlign: 'center', marginBottom: 2 },
        eventMessage: { fontFamily: bodyFontFam, fontSize: 9, color: '#8A847B', textAlign: 'center', lineHeight: 1.5 },
        gangWrap: { alignItems: 'center', marginBottom: 2 },
        gangEyebrow: { fontFamily: bodyFontFam, fontSize: 7, color: accent, letterSpacing: 2, marginBottom: 2 },
        gangName: { fontFamily: headingFontFam, fontSize: 18, color: text, fontStyle: 'italic' },
        gangDesc: { fontFamily: headingFontFam, fontSize: 9, color: '#8A847B', fontStyle: 'italic', textAlign: 'center', marginTop: 3, marginBottom: 6, maxWidth: 380 },
        dish: { alignItems: 'center', marginBottom: 4, maxWidth: 360 },
        dishRow: { flexDirection: 'row', alignItems: 'baseline' },
        dishName: { fontFamily: headingFontFam, fontSize: 11, color: text },
        dishAllergens: { fontFamily: bodyFontFam, fontSize: 7, color: accent, marginLeft: 4, letterSpacing: 0.5 },
        dishDesc: { fontFamily: bodyFontFam, fontSize: 8, color: '#8A847B', textAlign: 'center', marginTop: 1, lineHeight: 1.4 },
        legendWrap: { alignItems: 'center', marginTop: 'auto', paddingTop: 12 },
        legendLine: { width: 80, height: 1, backgroundColor: accent, opacity: 0.4, marginBottom: 6 },
        legendLabel: { fontFamily: bodyFontFam, fontSize: 8, color: accent, letterSpacing: 1.5, marginBottom: 3 },
        legendText: { fontFamily: bodyFontFam, fontSize: 8, color: '#8A847B', textAlign: 'center', lineHeight: 1.6 },
        footer: { fontFamily: bodyFontFam, fontSize: 8, color: '#D0C8B8', textAlign: 'center', marginTop: 8 },
    });

    return (
        <Document title={`Menukaart — ${brandName}`}>
            <Page size={{ width, height }} style={styles.page}>
                <View style={styles.headerWrap}>
                    {data.logoUrl ? (
                        <Image src={data.logoUrl} style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 8 }} />
                    ) : (
                        <View style={styles.logoCircle}>
                            <Text style={styles.logoLetter}>{initials}</Text>
                        </View>
                    )}
                    <Text style={styles.brandName}>{brandName}</Text>
                    {subtitle ? <Text style={styles.subtitle}>{subtitle.toUpperCase()}</Text> : null}
                </View>

                <Text style={styles.menuLabel}>MENU</Text>

                {eventBlock?.position === 'top' && (
                    <View style={styles.eventBox}>
                        {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                        {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                    </View>
                )}

                {data.gangen.map((gang, gi) => (
                    <View key={gi} wrap={false}>
                        {(overrides.showDividers !== false) && <View style={styles.divider} />}
                        <View style={styles.gangWrap}>
                            <Text style={styles.gangEyebrow}>
                                {gang.eyebrow ?? `GANG ${String(gi + 1).padStart(2, '0')}`}
                            </Text>
                            <Text style={styles.gangName}>{gang.name}</Text>
                            {gang.description ? <Text style={styles.gangDesc}>{gang.description}</Text> : null}
                            {gang.dishes.map((dish, di) => (
                                <View key={di} style={styles.dish}>
                                    <View style={styles.dishRow}>
                                        <Text style={styles.dishName}>{dish.name}</Text>
                                        {allergensInline(dish.allergens) ? (
                                            <Text style={styles.dishAllergens}>{allergensInline(dish.allergens)}</Text>
                                        ) : null}
                                    </View>
                                    {dish.description ? <Text style={styles.dishDesc}>{dish.description}</Text> : null}
                                </View>
                            ))}
                        </View>
                    </View>
                ))}

                {eventBlock?.position === 'bottom' && (
                    <View style={styles.eventBox}>
                        {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                        {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                    </View>
                )}

                <View style={styles.legendWrap}>
                    {(overrides.showOrnament !== false) && <View style={styles.legendLine} />}
                    <Text style={styles.legendLabel}>ALLERGENEN</Text>
                    <Text style={styles.legendText}>{legend || '—'}</Text>
                    {footer ? <Text style={styles.footer}>{footer}</Text> : null}
                </View>
            </Page>
        </Document>
    );
}
