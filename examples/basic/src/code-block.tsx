export function CodeBlock({ code }: { code: string }) {
  return (
    <pre
      style={{
        background: '#f5f5f4',
        borderRadius: '0.5rem',
        font: '400 0.875rem/1.5 monospace',
        margin: 0,
        padding: '0.75rem 1rem',
      }}
    >
      <code>{code}</code>
    </pre>
  );
}
