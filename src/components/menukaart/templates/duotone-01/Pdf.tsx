/**
 * Duotone-01 PDF — knal grafisch poster, brand-bottom-bar.
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

export default function Duotone01Pdf({ overrides, data }: PdfTemplateProps) {
    const accent = overrides.accent ?? '#FF4500';
    const bg = overrides.bg ?? '#141210';
    const text = overrides.text ?? '#F4F0E8';
    const muted = '#8A8478';
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
        topStrip: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: accent },
        hero: { padding: 36, paddingTop: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
        heroLeft: { flexDirection: 'row', alignItems: 'center' },
        logoBox: { width: 50, height: 50, borderWidth: 2, borderColor: accent, borderRadius: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
        logoLetter: { fontFamily: headingFontFam, fontSize: 22, color: accent, fontWeight: 'bold' },
        brandName: { fontFamily: headingFontFam, fontSize: 30, color: accent, letterSpacing: 2, fontWeight: 'bold' },
        subtitle: { fontSize: 8, color: muted, letterSpacing: 1.5, marginTop: 2 },
        menuWord: { fontFamily: headingFontFam, fontSize: 56, color: accent, opacity: 0.2, fontWeight: 'bold' },
        gradient: { height: 1, backgroundColor: accent, marginHorizontal: 36, marginTop: 10, opacity: 0.5 },
        content: { padding: 28, paddingBottom: 60 },
        eventBox: { padding: 10, backgroundColor: `${accent}26`, borderLeftWidth: 3, borderLeftColor: accent, marginBottom: 12 },
        eventTitle: { fontFamily: headingFontFam, fontSize: 16, color: accent, letterSpacing: 1.5, marginBottom: 2, fontWeight: 'bold' },
        eventMessage: { fontSize: 9, color: muted, lineHeight: 1.5 },
        gang: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ffffff0a' },
        gangNumCol: { width: 56, marginRight: 10 },
        gangNum: { fontFamily: headingFontFam, fontSize: 40, color: accent, lineHeight: 0.8, fontWeight: 'bold' },
        gangContent: { flex: 1 },
        gangName: { fontFamily: headingFontFam, fontSize: 18, color: accent, letterSpacing: 1.5, fontWeight: 'bold' },
        gangDesc: { fontSize: 9, color: muted, lineHeight: 1.5, marginVertical: 3 },
        dish: { marginBottom: 5 },
        dishRow: { flexDirection: 'row', alignItems: 'baseline' },
        dishName: { fontSize: 11, color: text, fontWeight: 'bold' },
        dishBadge: { fontSize: 8, color: barText, backgroundColor: accent, paddingVertical: 1, paddingHorizontal: 4, marginLeft: 5, fontWeight: 'bold', letterSpacing: 0.5 },
        dishDesc: { fontSize: 8, color: muted, lineHeight: 1.4, marginTop: 1 },
        botBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: accent, paddingVertical: 10, paddingHorizontal: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        botLabel: { fontFamily: headingFontFam, fontSize: 12, color: barText, letterSpacing: 1.5, fontWeight: 'bold' },
        botItems: { fontSize: 8, color: barText, opacity: 0.75, maxWidth: 360, textAlign: 'right', lineHeight: 1.5 },
        footer: { position: 'absolute', bottom: 36, left: 0, right: 0, fontSize: 7, color: muted, textAlign: 'center', opacity: 0.55 },
    });

    return (
        <Document title={`Menukaart — ${brandName}`}>
            <Page size={{ width, height }} style={styles.page}>
                <View style={styles.topStrip} />

                <View style={styles.hero}>
                    <View style={styles.heroLeft}>
                        {/* Donker bg → prefer logo-donker (witte variant) als die geüpload is */}
                        {(data.logoUrlDonker ?? data.logoUrl) ? (
                            <Image src={(data.logoUrlDonker ?? data.logoUrl) as string} style={{ width: 50, height: 50, marginRight: 12, objectFit: 'contain' }} />
                        ) : (
                            <View style={styles.logoBox}>
                                <Text style={styles.logoLetter}>{initials}</Text>
                            </View>
                        )}
                        <View>
                            <Text style={styles.brandName}>{brandName.toUpperCase()}</Text>
                            {subtitle ? <Text style={styles.subtitle}>{subtitle.toUpperCase()}</Text> : null}
                        </View>
                    </View>
                    <Text style={styles.menuWord}>MENU</Text>
                </View>
                <View style={styles.gradient} />

                <View style={styles.content}>
                    {eventBlock?.position === 'top' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title.toUpperCase()}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}

                    {data.gangen.map((gang, gi) => {
                        const num = String(gi + 1).padStart(2, '0');
                        return (
                            <View key={gi} style={styles.gang} wrap={false}>
                                <View style={styles.gangNumCol}>
                                    <Text style={styles.gangNum}>{num}</Text>
                                </View>
                                <View style={styles.gangContent}>
                                    <Text style={styles.gangName}>{gang.name.toUpperCase()}</Text>
                                    {gang.description ? <Text style={styles.gangDesc}>{gang.description}</Text> : null}
                                    {gang.dishes.map((dish, di) => (
                                        <View key={di} style={styles.dish}>
                                            <View style={styles.dishRow}>
                                                <Text style={styles.dishName}>{dish.name}</Text>
                                                {allergensInline(dish.allergens) ? (
                                                    <Text style={styles.dishBadge}>{allergensInline(dish.allergens)}</Text>
                                                ) : null}
                                            </View>
                                            {dish.description ? <Text style={styles.dishDesc}>{dish.description}</Text> : null}
                                        </View>
                                    ))}
                                </View>
                            </View>
                        );
                    })}

                    {eventBlock?.position === 'bottom' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title.toUpperCase()}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}
                </View>

                {legend ? (
                    <View style={styles.botBar}>
                        <Text style={styles.botLabel}>ALLERGENEN</Text>
                        <Text style={styles.botItems}>{legend}</Text>
                    </View>
                ) : null}
                {footer ? <Text style={styles.footer}>{footer}</Text> : null}
            </Page>
        </Document>
    );
}
