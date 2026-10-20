'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { OPEN_TEGELSCHERM } from './events';
import { whenIdle } from '@/lib/whenIdle';

/* Het tegelscherm zelf komt pas binnen als iemand het opent. */
const Tegelscherm = dynamic(() => import('./Tegelscherm'), { ssr: false });

/**
 * Klein luisterpunt dat altijd in de app-schil hangt: vangt "open het
 * tegelscherm" op (⊞ in de balk, Meer in de onderbalk, het gebruikersmenu)
 * en laadt dan pas het scherm. Nog een keer openen terwijl het open is,
 * sluit het (de onderbalk-knop werkt als schakelaar).
 */
export default function TegelschermHost() {
    const [open, setOpen] = useState(false);
    const sluit = useCallback(function () { setOpen(false); }, []);

    /* Het stukje JavaScript alvast ophalen als de browser niets te doen heeft,
       zodat de eerste tik op ⊞ meteen opent in plaats van eerst te laden. */
    useEffect(function () {
        return whenIdle(function () { void import('./Tegelscherm'); }, 4000, 3000);
    }, []);

    useEffect(function () {
        function opOpen() { setOpen(function (v) { return !v; }); }
        window.addEventListener(OPEN_TEGELSCHERM, opOpen);
        return function () { window.removeEventListener(OPEN_TEGELSCHERM, opOpen); };
    }, []);

    return open ? <Tegelscherm onClose={sluit} /> : null;
}
