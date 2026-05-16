/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2 } from 'lucide-react';
import { resizeImage } from '@/lib/utils';

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

      // Slaat bon op in 'bonnen' table — minimum payload, bon-process verrijkt later.
      const res = await fetch('/api/bonnen/quick-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ image_data_url: resized }),
      });
      const json = await res.json();
      if (!res.ok || !json.bon_id) throw new Error(json.error || 'Upload mislukt');
      // Naar /inkoop met scan-id, daar kan cateraar bevestigen
      router.push(`/inkoop?bon=${json.bon_id}`);
    } catch (err: any) {
      alert('Scan-fout: ' + (err?.message || 'onbekend'));
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
