/**
 * Editorial-01 PDF — magazine spread, brand header band, drop-cap narratief.
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

export default function Editorial01Pdf({ overrides, data }: PdfTemplateProps) {
    const accent = overrides.accent ?? '#8B0000';
    const bg = overrides.bg ?? '#F4F0E6';
    const text = overrides.text ?? '#2C2820';
    const muted = '#8E887E';
    const warm = '#EAE2D0';
    const headingFontFam = mapFontToPdf(overrides.headingFont);
    const bodyFontFam = mapFontToPdf(overrides.bodyFont);
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? '';
    const eventBlock = readEventBlock(overrides);
    const footer = footerLine(overrides);
    const legend = formatAllergenLegend(data.gangen);
    const initials = logoInitials(brandName);
    const headerText = pdfContrastColor(accent);
    const showFootnote = overrides.showFootnoteAllergens !== false;
    const { width, height } = pageSize('a4');

    const styles = StyleSheet.create({
        page: { backgroundColor: bg, fontFamily: bodyFontFam, color: text },
        headerBand: { backgroundColor: accent, paddingVertical: 22, paddingHorizontal: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', color: headerText },
        headerLeft: { flexDirection: 'row', alignItems: 'center' },
        logoBox: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#ffffff66', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
        logoLetter: { fontFamily: headingFontFam, fontSize: 16, color: headerText, fontWeight: 'bold' },
        brandName: { fontFamily: headingFontFam, fontSize: 20, color: headerText },
        subtitle: { fontSize: 8, color: headerText, opacity: 0.55, letterSpacing: 1.5, marginTop: 2 },
        menuTag: { fontFamily: headingFontFam, fontSize: 30, color: headerText, opacity: 0.25, fontStyle: 'italic' },
        content: { padding: 36, paddingTop: 18, paddingBottom: 24, flex: 1 },
        eventBox: { backgroundColor: warm, borderLeftWidth: 3, borderLeftColor: accent, padding: 10, marginBottom: 14 },
        eventTitle: { fontFamily: headingFontFam, fontSize: 14, color: accent, marginBottom: 2 },
        eventMessage: { fontFamily: headingFontFam, fontSize: 10, fontStyle: 'italic', color: text, lineHeight: 1.5 },
        gang: { marginBottom: 12 },
        gangTop: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 3 },
        gangEyebrow: { fontSize: 8, color: accent, letterSpacing: 2, fontWeight: 'bold', marginRight: 8 },
        gangName: { fontFamily: headingFontFam, fontSize: 18, color: text },
        gangAccent: { height: 1, backgroundColor: accent, opacity: 0.5, marginBottom: 6 },
        gangSplit: { flexDirection: 'row' },
        narrativeCard: { width: 175, backgroundColor: warm, borderLeftWidth: 3, borderLeftColor: accent, padding: 10, marginRight: 14 },
        narrative: { fontFamily: headingFontFam, fontSize: 10, fontStyle: 'italic', color: text, lineHeight: 1.6 },
        dishesCol: { flex: 1 },
        dish: { paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#0000000a' },
        dishName: { fontFamily: headingFontFam, fontSize: 11, color: text, fontWeight: 'bold' },
        dishDesc: { fontFamily: headingFontFam, fontSize: 8, fontStyle: 'italic', color: muted },
        footnote: { fontSize: 8, color: muted, textAlign: 'right', marginTop: 3 },
        footnoteCode: { color: accent, fontWeight: 'bold' },
        divider: { height: 1, backgroundColor: '#D0C8BA', marginVertical: 3, marginBottom: 12 },
        legend: { borderTopWidth: 2, borderTopColor: accent, paddingTop: 10, marginTop: 'auto', flexDirection: 'row', alignItems: 'baseline' },
        legendLabel: { fontSize: 9, color: accent, letterSpacing: 1.5, fontWeight: 'bold', marginRight: 10 },
        legendText: { fontSize: 8, color: muted, lineHeight: 1.7, flex: 1 },
        footer: { fontSize: 7, color: '#D0C8BA', marginTop: 6 },
    });

    return (
        <Document title={`Menukaart — ${brandName}`}>
            <Page size={{ width, height }} style={styles.page}>
                <View style={styles.headerBand}>
                    <View style={styles.headerLeft}>
                        {data.logoUrl ? (
                            <Image src={data.logoUrl} style={{ width: 40, height: 40, objectFit: 'contain', marginRight: 12 }} />
                        ) : (
                            <View style={styles.logoBox}>
                                <Text style={styles.logoLetter}>{initials}</Text>
                            </View>
                        )}
                        <View>
                            <Text style={styles.brandName}>{brandName}</Text>
                            {subtitle ? <Text style={styles.subtitle}>{subtitle.toUpperCase()}</Text> : null}
                        </View>
                    </View>
                    <Text style={styles.menuTag}>Menu</Text>
                </View>

                <View style={styles.content}>
                    {eventBlock?.position === 'top' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}

                    {data.gangen.map((gang, gi) => {
                        const used = gangAllergens(gang);
                        const isLast = gi === data.gangen.length - 1;
                        return (
                            <View key={gi} wrap={false}>
                                <View style={styles.gang}>
                                    <View style={styles.gangTop}>
                                        <Text style={styles.gangEyebrow}>GANG {String(gi + 1).padStart(2, '0')}</Text>
                                        <Text style={styles.gangName}>{gang.name}</Text>
                                    </View>
                                    <View style={styles.gangAccent} />
                                    <View style={styles.gangSplit}>
                                        <View style={styles.narrativeCard}>
                                            {gang.description ? <Text style={styles.narrative}>{gang.description}</Text> : null}
                                        </View>
                                        <View style={styles.dishesCol}>
                                            {gang.dishes.map((dish, di) => (
                                                <View key={di} style={styles.dish}>
                                                    <Text style={styles.dishName}>{dish.name}</Text>
                                                    {dish.description ? <Text style={styles.dishDesc}>{dish.description}</Text> : null}
                                                </View>
                                            ))}
                                            {showFootnote && used.length > 0 && (
                                                <Text style={styles.footnote}>
                                                    Bevat: {used.map(a => `${a} ${ALLERGEN_MAP[a]}`).join(', ')}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                </View>
                                {!isLast && (overrides.showDividers !== false) && <View style={styles.divider} />}
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
                    </View>
                    {footer ? <Text style={styles.footer}>{footer}</Text> : null}
                </View>
            </Page>
        </Document>
    );
}
