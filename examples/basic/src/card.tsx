import type { ReactNode } from 'react';

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        background: '#fafaf9',
        border: '1px solid #d6d3d1',
        borderRadius: '0.75rem',
        font: '400 1rem/1.6 sans-serif',
        maxWidth: '20rem',
        padding: '1rem 1.25rem',
      }}
    >
      <h2 style={{ font: '700 1.1rem/1.4 sans-serif', margin: '0 0 0.5rem' }}>{title}</h2>
      {children}
    </section>
  );
}
