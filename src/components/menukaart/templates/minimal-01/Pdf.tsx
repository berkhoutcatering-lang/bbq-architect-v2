/**
 * Minimal-01 PDF — mono, hairlines, dish-id (01.1) layout.
 */

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import {
    type PdfTemplateProps,
    mapFontToPdf,
    pageSize,
    readEventBlock,
    footerLine,
    allergensInline,
} from '@/lib/menukaart/pdf-shared';
import { getUsedAllergens, ALLERGEN_MAP } from '@/lib/menukaart/menu-data';

export default function Minimal01Pdf({ overrides, data }: PdfTemplateProps) {
    const accent = overrides.accent ?? '#0A0A0A';
    const bg = overrides.bg ?? '#FFFFFF';
    const text = overrides.text ?? '#0A0A0A';
    const muted = '#888888';
    const light = '#C0C0C0';
    const ghost = '#F2F2F2';
    const headingFontFam = mapFontToPdf(overrides.headingFont);
    const bodyFontFam = mapFontToPdf(overrides.bodyFont);
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? '';
    const eventBlock = readEventBlock(overrides);
    const footer = footerLine(overrides);
    const used = getUsedAllergens(data.gangen);
    const totalDishes = data.gangen.reduce((s, g) => s + g.dishes.length, 0);
    const { width, height } = pageSize('a4');

    const styles = StyleSheet.create({
        page: { backgroundColor: bg, fontFamily: bodyFontFam, color: text, padding: 56, paddingBottom: 36 },
        brand: { fontSize: 9, color: muted, letterSpacing: 1.8, marginBottom: 6 },
        menuWord: { fontFamily: headingFontFam, fontSize: 56, color: text, lineHeight: 0.85, fontWeight: 'bold' },
        h2: { fontSize: 10, color: muted, letterSpacing: 2, marginTop: 8 },
        rule: { width: '100%', height: 1.5, backgroundColor: text, marginTop: 10, marginBottom: 22 },
        eventBox: { borderTopWidth: 1, borderBottomWidth: 1, borderTopColor: text, borderBottomColor: text, paddingVertical: 8, marginBottom: 14 },
        eventTitle: { fontFamily: headingFontFam, fontSize: 11, color: text, letterSpacing: 2, marginBottom: 2, fontWeight: 'bold' },
        eventMessage: { fontSize: 9, color: muted, fontStyle: 'italic', lineHeight: 1.5 },
        gang: { marginBottom: 18 },
        gangNum: { fontSize: 10, color: text, letterSpacing: 2, marginBottom: 2, fontWeight: 'bold' },
        gangBar: { width: 26, height: 1.5, backgroundColor: accent, marginBottom: 4 },
        gangDesc: { fontSize: 8, color: muted, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 5, maxWidth: 380 },
        dish: { flexDirection: 'row', marginBottom: 4 },
        dishId: { width: 30, fontSize: 8, color: light, textAlign: 'right', paddingRight: 4, borderRightWidth: 1, borderRightColor: ghost, marginRight: 8 },
        dishContent: { flex: 1 },
        dishName: { fontSize: 11, color: text, fontWeight: 'bold' },
        dishAllergens: { fontSize: 8, color: accent, marginLeft: 6, letterSpacing: 0.5 },
        dishDesc: { fontSize: 8, color: muted, lineHeight: 1.45, marginTop: 1 },
        sep: { textAlign: 'center', fontSize: 9, color: light, letterSpacing: 3, marginVertical: 6 },
        legendRule: { width: '100%', height: 1.5, backgroundColor: text, marginBottom: 8 },
        legendHead: { flexDirection: 'row', justifyContent: 'space-between' },
        legendLabel: { fontSize: 9, color: text, letterSpacing: 1.5, fontWeight: 'bold' },
        legendCount: { fontSize: 9, color: light },
        legendGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
        legendItem: { width: '25%', fontSize: 8, color: muted, marginBottom: 2 },
        legendCode: { fontWeight: 'bold', color: text },
        footer: { fontSize: 8, color: light, marginTop: 8 },
    });

    return (
        <Document title={`Menukaart — ${brandName}`}>
            <Page size={{ width, height }} style={styles.page}>
                {data.logoUrl ? (
                    <Image src={data.logoUrl} style={{ maxHeight: 40, objectFit: 'contain', marginBottom: 6 }} />
                ) : null}
                <Text style={styles.brand}>{brandName.toUpperCase()}</Text>
                <Text style={styles.menuWord}>Menu</Text>
                <Text style={styles.h2}>{brandName.toUpperCase()}</Text>
                {subtitle ? <Text style={{ fontSize: 8, color: light }}>{subtitle}</Text> : null}
                <View style={styles.rule} />

                {eventBlock?.position === 'top' && (
                    <View style={styles.eventBox}>
                        {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title.toUpperCase()}</Text> : null}
                        {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                    </View>
                )}

                {data.gangen.map((gang, gi) => {
                    const num = String(gi + 1).padStart(2, '0');
                    return (
                        <View key={gi} wrap={false}>
                            <View style={styles.gang}>
                                <Text style={styles.gangNum}>{gang.name.toUpperCase()}</Text>
                                <View style={styles.gangBar} />
                                {gang.description ? <Text style={styles.gangDesc}>{gang.description}</Text> : null}
                                {gang.dishes.map((dish, di) => (
                                    <View key={di} style={styles.dish}>
                                        <Text style={styles.dishId}>{num}.{di + 1}</Text>
                                        <View style={styles.dishContent}>
                                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                                <Text style={styles.dishName}>{dish.name}</Text>
                                                {allergensInline(dish.allergens) ? (
                                                    <Text style={styles.dishAllergens}>{allergensInline(dish.allergens)}</Text>
                                                ) : null}
                                            </View>
                                            {dish.description ? <Text style={styles.dishDesc}>{dish.description}</Text> : null}
                                        </View>
                                    </View>
                                ))}
                            </View>
                            {gi < data.gangen.length - 1 && <Text style={styles.sep}>· · ·</Text>}
                        </View>
                    );
                })}

                {eventBlock?.position === 'bottom' && (
                    <View style={styles.eventBox}>
                        {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title.toUpperCase()}</Text> : null}
                        {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                    </View>
                )}

                <View style={{ marginTop: 'auto' }}>
                    <View style={styles.legendRule} />
                    <View style={styles.legendHead}>
                        <Text style={styles.legendLabel}>ALLERGENEN</Text>
                        <Text style={styles.legendCount}>
                            {used.length} allergenen · {totalDishes} gerechten
                        </Text>
                    </View>
                    <View style={styles.legendGrid}>
                        {used.map(a => (
                            <Text key={a} style={styles.legendItem}>
                                <Text style={styles.legendCode}>{a}</Text> {ALLERGEN_MAP[a]}
                            </Text>
                        ))}
                    </View>
                    {footer ? <Text style={styles.footer}>{footer}</Text> : null}
                </View>
            </Page>
        </Document>
    );
}
