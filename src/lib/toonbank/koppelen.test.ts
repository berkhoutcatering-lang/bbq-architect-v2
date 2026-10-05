import { describe, expect, it } from 'vitest';
import { KOPPEL_IPV6_PREFIX, koppelBron, koppelNetwerk } from './koppelen';

describe('koppelNetwerk / koppelBron (hercontrole M2, N4b)', () => {
    it('IPv6 telt per /56: andere adressen en andere /64’s in hetzelfde /56 zijn één bron', () => {
        expect(KOPPEL_IPV6_PREFIX).toBe(56);
        expect(koppelNetwerk('2001:db8:12:34ab::1')).toBe('2001:db8:12:3400::/56');
        const zelfde = [
            '2001:db8:12:3400::1',
            '2001:db8:12:3400:dead:beef:0:7',
            '2001:0db8:0012:34ff:ffff:ffff:ffff:ffff',
            '2001:DB8:12:3401::5',
            '[2001:db8:12:3402::9]:443',
            '2001:db8:12:3403::1%en0',
        ];
        const bronnen = new Set(zelfde.map(koppelBron));
        expect(bronnen.size).toBe(1);
        expect(koppelBron('2001:db8:12:3500::1')).not.toBe(koppelBron('2001:db8:12:3400::1'));
        expect(koppelBron('2001:db8:13:3400::1')).not.toBe(koppelBron('2001:db8:12:3400::1'));
    });

    it('IPv4 blijft per adres; IPv4 in IPv6-vorm is dat IPv4-adres', () => {
        expect(koppelNetwerk('192.0.2.1')).toBe('192.0.2.1');
        expect(koppelNetwerk(' 192.0.2.1:5555 ')).toBe('192.0.2.1');
        expect(koppelNetwerk('::ffff:192.0.2.1')).toBe('192.0.2.1');
        expect(koppelNetwerk('::ffff:c000:201')).toBe('192.0.2.1');
        expect(koppelBron('::ffff:192.0.2.1')).toBe(koppelBron('192.0.2.1'));
        expect(koppelBron('192.0.2.2')).not.toBe(koppelBron('192.0.2.1'));
    });

    it('volledige, verkorte en ingebedde schrijfwijzen geven hetzelfde netwerk', () => {
        expect(koppelNetwerk('2001:db8::')).toBe('2001:db8:0:0::/56');
        expect(koppelNetwerk('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8:0:0::/56');
        expect(koppelNetwerk('::1')).toBe('0:0:0:0::/56');
        expect(koppelNetwerk('64:ff9b::192.0.2.1')).toBe('64:ff9b:0:0::/56');
    });

    it('geen leesbaar adres: blijft zoals het is (één bron), en de bron is altijd 64 hex', () => {
        expect(koppelNetwerk('onbekend')).toBe('onbekend');
        expect(koppelNetwerk('ONBEKEND')).toBe('onbekend');
        expect(koppelNetwerk('1:2:3')).toBe('1:2:3');
        for (const ip of ['onbekend', '192.0.2.1', '2001:db8::1', '']) expect(koppelBron(ip)).toMatch(/^[0-9a-f]{64}$/);
    });
});
