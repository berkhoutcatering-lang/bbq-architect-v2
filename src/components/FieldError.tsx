'use client';

import { AlertCircle } from 'lucide-react';

interface FieldErrorProps {
  /** Direct error-message — gebruikt door client-side validatie. */
  message?: string;
  /**
   * Server Action error-map (zoals `result.fields` retourneert uit
   * upsertKlant/upsertOfferte/etc). Combineer met `name` om de juiste
   * error op te zoeken — voorkomt verspreid `result.fields.naam?.[0]`
   * door consumers heen.
   */
  fields?: Record<string, string[] | undefined>;
  /** Veld-naam, gebruikt om message uit `fields` op te halen. */
  name?: string;
  /** Must match the field name to link via aria-describedby. */
  fieldName?: string;
}

/**
 * Hulpfunctie die de eerste error-message uit een server-fields-map
 * pakt. Buiten de component bruikbaar voor `aria-invalid` toggles.
 */
export function getFieldError(
  fields: Record<string, string[] | undefined> | undefined,
  name: string,
): string | undefined {
  return fields?.[name]?.[0];
}

export default function FieldError({ message, fields, name, fieldName }: FieldErrorProps) {
  const resolved = message ?? (name ? getFieldError(fields, name) : undefined);
  if (!resolved) return null;
  return (
    <p
      className="field-error-msg"
      id={(fieldName || name) ? (fieldName || name) + '-error' : undefined}
      role="alert"
    >
      <AlertCircle size={13} aria-hidden="true" />
      {resolved}
    </p>
  );
}
