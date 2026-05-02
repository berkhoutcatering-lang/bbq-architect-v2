'use client';
import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';

interface Props {
  onScan: (km: number, vertrouwen: 'hoog' | 'midden' | 'laag') => void;
  label?: string;
}

export function ScanKmButton({ onScan, label = 'Foto km-stand' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setHint(null);
    try {
      const base64 = await toBase64(file);
      const res = await fetch('/api/ritten/scan-km', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const body = await res.json();
      if (!res.ok || !body.suggestion?.km_stand) {
        setHint(body.suggestion?.notitie ?? body.error ?? 'Niet leesbaar — typ handmatig');
        return;
      }
      const s = body.suggestion;
      onScan(s.km_stand, s.vertrouwen);
      const conf = { hoog: 'hoge', midden: 'gemiddelde', laag: 'lage' }[s.vertrouwen as 'hoog' | 'midden' | 'laag'];
      setHint(`${s.km_stand} km · ${conf} betrouwbaarheid · controleer`);
    } catch (e) {
      setHint(`Fout: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted disabled:opacity-50"
      >
        <Camera className="h-4 w-4" /> {busy ? 'Lezen…' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

async function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
