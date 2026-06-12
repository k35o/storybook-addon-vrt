import { useState } from 'react';

export function Button({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  return (
    <button
      type="button"
      onClick={() => setCount((current) => current + 1)}
      style={{
        background: '#0e7490',
        border: 'none',
        borderRadius: '0.5rem',
        color: '#ffffff',
        cursor: 'pointer',
        font: '600 1rem/1.5 sans-serif',
        padding: '0.5rem 1.25rem',
      }}
    >
      {label}
      {count > 0 ? ` (${count})` : ''}
    </button>
  );
}
