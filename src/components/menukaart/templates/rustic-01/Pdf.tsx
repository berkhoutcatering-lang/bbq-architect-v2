/**
 * Rustic-01 PDF — kraft-papier, Caveat script → italic, wax-seal logo.
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

export default function Rustic01Pdf({ overrides, data }: PdfTemplateProps) {
    const accent = overrides.accent ?? '#7C5234';
    const bg = overrides.bg ?? '#E8DCBE';
    const text = overrides.text ?? '#3D2E1E';
    const muted = '#6E6250';
    const light = '#B8AA8A';
    const headingFontFam = mapFontToPdf(overrides.headingFont);
    const bodyFontFam = mapFontToPdf(overrides.bodyFont);
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? '';
    const eventBlock = readEventBlock(overrides);
    const footer = footerLine(overrides);
    const legend = formatAllergenLegend(data.gangen);
    const initial = logoInitials(brandName).charAt(0);
    const showOrnament = overrides.showOrnament !== false;
    const showDividers = overrides.showDividers !== false;
    const { width, height } = pageSize('a4');

    const styles = StyleSheet.create({
        page: { backgroundColor: bg, fontFamily: bodyFontFam, color: text, padding: 40, paddingBottom: 30 },
        innerFrame: { position: 'absolute', top: 18, left: 22, right: 22, bottom: 18, borderWidth: 1.5, borderColor: light, borderRadius: 2 },
        innerFrameInside: { position: 'absolute', top: 22, left: 26, right: 26, bottom: 22, borderWidth: 0.5, borderColor: light, borderRadius: 1 },
        content: { padding: 28, paddingTop: 24, alignItems: 'center' },
        seal: { width: 60, height: 60, borderRadius: 30, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
        sealLetter: { fontFamily: headingFontFam, fontSize: 26, color: '#FFFFFFE6', fontWeight: 'bold', fontStyle: 'italic' },
        brandName: { fontFamily: headingFontFam, fontSize: 28, color: text, fontStyle: 'italic', fontWeight: 'bold' },
        subtitle: { fontFamily: bodyFontFam, fontSize: 8, fontStyle: 'italic', color: muted, letterSpacing: 1.2, marginTop: 3 },
        vine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
        vineLine: { width: 50, height: 1, backgroundColor: accent, opacity: 0.4 },
        vineDot: { width: 5, height: 5, backgroundColor: accent, opacity: 0.5, marginHorizontal: 5 },
        eventBox: { alignItems: 'center', marginBottom: 8 },
        eventTitle: { fontFamily: headingFontFam, fontSize: 16, fontStyle: 'italic', color: accent, marginBottom: 2 },
        eventMessage: { fontFamily: bodyFontFam, fontSize: 9, fontStyle: 'italic', color: muted, textAlign: 'center', lineHeight: 1.5, maxWidth: 360 },
        gang: { alignItems: 'center', marginBottom: 12, width: '100%' },
        gangName: { fontFamily: headingFontFam, fontSize: 22, color: accent, fontStyle: 'italic', fontWeight: 'bold' },
        gangDesc: { fontFamily: bodyFontFam, fontSize: 9, fontStyle: 'italic', color: muted, textAlign: 'center', lineHeight: 1.55, marginTop: 3, marginBottom: 6, maxWidth: 360 },
        dishesArea: { backgroundColor: '#ffffff1c', borderRadius: 3, padding: 10, alignItems: 'center', maxWidth: 440, width: '90%' },
        dish: { alignItems: 'center', marginBottom: 4 },
        dishRow: { flexDirection: 'row', alignItems: 'baseline' },
        dishName: { fontFamily: bodyFontFam, fontSize: 11, color: text },
        dishAllergens: { fontFamily: bodyFontFam, fontSize: 8, color: accent, marginLeft: 4 },
        dishDesc: { fontFamily: bodyFontFam, fontSize: 8, color: muted, fontStyle: 'italic', textAlign: 'center', marginTop: 1, lineHeight: 1.4 },
        legend: { alignItems: 'center', marginTop: 'auto' },
        legendLine: { width: 60, height: 1, backgroundColor: light, marginBottom: 4 },
        legendLabel: { fontSize: 8, color: accent, letterSpacing: 1.5, fontWeight: 'bold', marginBottom: 3 },
        legendText: { fontSize: 8, color: muted, fontStyle: 'italic', textAlign: 'center', lineHeight: 1.6 },
        footer: { fontSize: 7, color: muted, opacity: 0.5, marginTop: 6 },
    });

    return (
        <Document title={`Menukaart — ${brandName}`}>
            <Page size={{ width, height }} style={styles.page}>
                {showOrnament && (
                    <>
                        <View style={styles.innerFrame} />
                        <View style={styles.innerFrameInside} />
                    </>
                )}
                <View style={styles.content}>
                    {data.logoUrl ? (
                        <Image src={data.logoUrl} style={{ width: 60, height: 60, borderRadius: 30, marginBottom: 8 }} />
                    ) : (
                        <View style={styles.seal}>
                            <Text style={styles.sealLetter}>{initial}</Text>
                        </View>
                    )}
                    <Text style={styles.brandName}>{brandName}</Text>
                    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

                    {showDividers && (
                        <View style={styles.vine}>
                            <View style={styles.vineLine} />
                            <View style={styles.vineDot} />
                            <View style={styles.vineLine} />
                        </View>
                    )}

                    {eventBlock?.position === 'top' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}

                    {data.gangen.map((gang, gi) => (
                        <View key={gi} style={styles.gang} wrap={false}>
                            <Text style={styles.gangName}>{gang.name}</Text>
                            {gang.description ? <Text style={styles.gangDesc}>{gang.description}</Text> : null}
                            <View style={styles.dishesArea}>
                                {gang.dishes.map((dish, di) => (
                                    <View key={di} style={styles.dish}>
                                        <View style={styles.dishRow}>
                                            <Text style={styles.dishName}>{dish.name}</Text>
                                            {allergensInline(dish.allergens) ? (
                                                <Text style={styles.dishAllergens}>({allergensInline(dish.allergens)})</Text>
                                            ) : null}
                                        </View>
                                        {dish.description ? <Text style={styles.dishDesc}>{dish.description}</Text> : null}
                                    </View>
                                ))}
                            </View>
                            {showDividers && gi < data.gangen.length - 1 && (
                                <View style={styles.vine}>
                                    <View style={styles.vineLine} />
                                    <View style={styles.vineDot} />
                                    <View style={styles.vineLine} />
                                </View>
                            )}
                        </View>
                    ))}

                    {eventBlock?.position === 'bottom' && (
                        <View style={styles.eventBox}>
                            {eventBlock.title ? <Text style={styles.eventTitle}>{eventBlock.title}</Text> : null}
                            {eventBlock.message ? <Text style={styles.eventMessage}>{eventBlock.message}</Text> : null}
                        </View>
                    )}

                    <View style={styles.legend}>
                        {legend ? (
                            <>
                                <View style={styles.legendLine} />
                                <Text style={styles.legendLabel}>ALLERGENEN</Text>
                                <Text style={styles.legendText}>{legend}</Text>
                            </>
                        ) : null}
                        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
                    </View>
                </View>
            </Page>
        </Document>
    );
}
