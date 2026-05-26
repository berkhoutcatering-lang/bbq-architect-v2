/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2 } from 'lucide-react';
import { resizeImage } from '@/lib/utils';
import { useToast } from '@/components/Toast';

/**
 * ScanFab
 * ───────
 * Floating action button voor 10-seconde foto-bon scan in field-mode.
 * Pillar #3 — opent native camera (capture=environment), uploadt resized
 * foto naar bonnen-tabel, opent /inkoop met scan-id zodat cateraar daar
 * bevestigt.
 *
 * Geen choice-screen — direct camera. Wel een spinner tijdens upload.
 */
export default function ScanFab() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const showToast = useToast();
  const [uploading, setUploading] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise(function (resolve, reject) {
        reader.onload = function () { resolve(String(reader.result)); };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsDataURL(file);
      });
      const resized = await resizeImage(dataUrl, 1920, 2560, 0.9);

      /* Bucket E P0-6 — upload+extract in één call.
         Veld-modus: cateraar wil snel resultaat. Endpoint /api/bonnen/extract
         leest direct + retourneert preview; we sturen door naar /bonnen waar
         het card-overzicht klaar staat. Bij duplicate (409) sturen we direct
         naar /archief?bon=... om de bestaande te openen. */
      const res = await fetch('/api/bonnen/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          source_type: 'camera',
          file_data_url: resized,
          filename: file.name || `camera-${Date.now()}.jpg`,
        }),
      });

      if (res.status === 409) {
        const dup = await res.json();
        showToast({
          message: `Deze bon staat al in je archief.`,
          type: 'warning',
          action: {
            label: 'Open',
            onClick: () => router.push(`/archief?bon=${dup.duplicate_bon_id}`),
          },
        });
        return;
      }

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || json.error || 'Upload mislukt');

      const itemCount = (json.items_with_suggestions || []).length;
      const lev = json.bon_preview?.leverancier_naam || 'bon';
      showToast({
        message: `${lev} — ${itemCount} regel${itemCount === 1 ? '' : 's'} uitgelezen.`,
        type: 'success',
        action: {
          label: 'Open',
          onClick: () => router.push('/bonnen'),
        },
      });
      router.push('/bonnen');
    } catch (err: any) {
      showToast('Scan-fout: ' + (err?.message || 'onbekend'), 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display: 'none' }}
        aria-hidden
      />
      <button
        type="button"
        className="scan-fab"
        onClick={function () { inputRef.current?.click(); }}
        disabled={uploading}
        aria-label="Scan bon"
        title="Scan bon (camera)"
      >
        {uploading ? <Loader2 size={22} className="scan-fab__spin" aria-hidden /> : <Camera size={22} aria-hidden />}
        <span className="scan-fab__label">{uploading ? 'Uploaden…' : 'Scan bon'}</span>
      </button>
    </>
  );
}
