'use client';

/**
 * GlobalToast — bridges AppContext notifications into the unified Toast system.
 * No longer renders its own UI — all notifications flow through ToastProvider.
 */

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/AppContext';
import { useToast } from '@/components/Toast';
import type { Notification } from '@/types';

export default function GlobalToast() {
    const { notifications, dismissNotification } = useApp();
    const showToast = useToast();
    const shownRef = useRef<Set<number>>(new Set());

    useEffect(function () {
        if (!notifications || notifications.length === 0) return;

        notifications.forEach(function (n: Notification) {
            if (shownRef.current.has(n.id)) return;
            shownRef.current.add(n.id);
            showToast(n.message, n.type);
            // Auto-dismiss from AppContext to prevent re-showing
            dismissNotification(n.id);
        });
    }, [notifications, showToast, dismissNotification]);

    // Clean up tracked IDs when they're no longer in notifications
    useEffect(function () {
        const currentIds = new Set((notifications || []).map(function (n: Notification) { return n.id; }));
        shownRef.current.forEach(function (id) {
            if (!currentIds.has(id)) {
                shownRef.current.delete(id);
            }
        });
    }, [notifications]);

    return null;
}
