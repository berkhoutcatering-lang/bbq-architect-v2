'use client';
import React from 'react';
import AIStudio from '@/components/AIStudio';
import { useAiStudio } from '@/lib/AiStudioContext';

export default function AiStudioOverlay(): React.ReactElement | null {
    const { isOpen, initial, close } = useAiStudio();
    if (!isOpen) return null;
    return (
        <AIStudio
            variant="overlay"
            initialMessages={initial?.messages as never}
            initialMode={initial?.mode}
            initialThinkingMode={initial?.thinkingMode}
            onClose={close}
        />
    );
}
