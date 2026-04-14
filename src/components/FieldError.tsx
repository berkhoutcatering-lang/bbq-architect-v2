'use client';

import { AlertCircle } from 'lucide-react';

interface FieldErrorProps {
  message?: string;
}

export default function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p className="field-error-msg">
      <AlertCircle size={13} />
      {message}
    </p>
  );
}
