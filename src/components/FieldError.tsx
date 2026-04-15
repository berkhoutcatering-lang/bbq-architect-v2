'use client';

import { AlertCircle } from 'lucide-react';

interface FieldErrorProps {
  message?: string;
  /** Must match the field name to link via aria-describedby */
  fieldName?: string;
}

export default function FieldError({ message, fieldName }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p
      className="field-error-msg"
      id={fieldName ? fieldName + '-error' : undefined}
      role="alert"
    >
      <AlertCircle size={13} aria-hidden="true" />
      {message}
    </p>
  );
}
