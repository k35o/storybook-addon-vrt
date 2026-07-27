import React, { useEffect, useRef, useState } from 'react';
import { AddonPanel, Button } from 'storybook/internal/components';
import {
  addons,
  types,
  useChannel,
  useParameter,
  useStorybookApi,
  useStorybookState,
} from 'storybook/manager-api';
import {
  type DiffMode,
  type DiffResponse,
  type ScanProgress,
  type ScanResponse,
  type ScanRow,
  type ScanScope,
  VRT_LIVE_REQUEST,
  VRT_LIVE_RESPONSE,
  VRT_LIVE_SCAN_PROGRESS,
  VRT_LIVE_SCAN_REQUEST,
  VRT_LIVE_SCAN_RESPONSE,
  VRT_LIVE_SNAPSHOT_SET,
  VRT_LIVE_SNAPSHOT_SET_DONE,
} from './channel';
import type { VrtStoryParameters } from './types';

const ADDON_ID = 'storybook-addon-vrt-live';
const PANEL_ID = `${ADDON_ID}/panel`;

type ViewMode = 'sideBySide' | 'diff' | 'slider';

const STATUS_COLOR: Record<string, string> = {
  passed: '#1a8917',
  changed: '#d92d20',
  added: '#0a7ea4',
};

function StatusBadge({ status }: { status: string }): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: '#fff',
        background: STATUS_COLOR[status] ?? '#6b7280',
      }}
    >
      {status}
    </span>
  );
}

function Frame({ label, src }: { label: string; src: string | null }): React.ReactElement {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          background: 'repeating-conic-gradient(#f3f4f6 0% 25%, #fff 0% 50%) 50% / 16px 16px',
          overflow: 'auto',
          maxHeight: '52vh',
        }}
      >
        {src ? (
          <img src={src} alt={label} style={{ display: 'block', maxWidth: '100%' }} />
        ) : (
          <div style={{ padding: 24, color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>—</div>
        )}
      </div>
    </div>
  );
}

function Slider({ baseline, current }: { baseline: string; current: string }): React.ReactElement {
  const [pos, setPos] = useState(50);
  return (
    <div>
      <div style={{ position: 'relative', border: '1px solid #e5e7eb', borderRadius: 6 }}>
        <img src={baseline} alt="baseline" style={{ display: 'block', maxWidth: '100%' }} />
        <img
          src={current}
          alt="current"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'left top',
            clipPath: `inset(0 0 0 ${pos}%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${pos}%`,
            width: 2,
            background: '#d92d20',
            pointerEvents: 'none',
          }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        style={{ width: '100%', marginTop: 8 }}
        aria-label="Reveal current over baseline"
      />
      <div
        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280' }}
      >
        <span>baseline</span>
        <span>current</span>
      </div>
    </div>
  );
}

function Result({ data }: { data: DiffResponse }): React.ReactElement {
  const [view, setView] = useState<ViewMode>('sideBySide');
  if (!data.ok) {
    if (data.skipped) {
      return <p style={{ color: '#6b7280' }}>This story is skipped (parameters.vrt.skip).</p>;
    }
    return <p style={{ color: '#d92d20' }}>Capture failed: {data.error}</p>;
  }

  const provenance =
    data.source.mode === 'ref' ? `baseline @ ${data.source.ref}` : 'snapshot baseline';
  const hasBaseline = data.baseline !== null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <StatusBadge status={data.status} />
        <span style={{ fontSize: 13 }}>
          {data.status === 'added'
            ? 'No baseline yet — this is the current render.'
            : data.status === 'passed'
              ? 'Matches the baseline.'
              : `${data.mismatchedPixels.toLocaleString()} px differ (${(data.mismatchRatio * 100).toFixed(2)}%)`}
        </span>
        {!data.stabilized && (
          <span style={{ fontSize: 11, color: '#b45309' }}>⚠ did not stabilize</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>{provenance}</div>

      {hasBaseline && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['sideBySide', 'diff', 'slider'] as const).map((v) => (
            <Button
              key={v}
              size="small"
              variant={view === v ? 'solid' : 'outline'}
              disabled={v === 'diff' && data.diff === null}
              onClick={() => setView(v)}
            >
              {v === 'sideBySide' ? 'Side by side' : v === 'diff' ? 'Diff' : 'Slider'}
            </Button>
          ))}
        </div>
      )}

      {!hasBaseline || view === 'sideBySide' ? (
        <div style={{ display: 'flex', gap: 12 }}>
          {hasBaseline && <Frame label="Baseline" src={data.baseline} />}
          <Frame label="Current" src={data.current} />
          {data.diff && <Frame label="Diff" src={data.diff} />}
        </div>
      ) : view === 'diff' ? (
        <Frame label="Diff" src={data.diff} />
      ) : (
        data.baseline && <Slider baseline={data.baseline} current={data.current} />
      )}
    </div>
  );
}

const SCAN_ORDER: Record<string, number> = { changed: 0, added: 1, skipped: 2, passed: 3 };

function ScanList({
  rows,
  onSelect,
}: {
  rows: ScanRow[];
  onSelect: (storyId: string) => void;
}): React.ReactElement {
  const count = (status: string): number => rows.filter((r) => r.status === status).length;
  const notable = rows
    .filter((r) => r.status === 'changed' || r.status === 'added')
    .sort(
      (a, b) =>
        (SCAN_ORDER[a.status] ?? 9) - (SCAN_ORDER[b.status] ?? 9) ||
        b.mismatchedPixels - a.mismatchedPixels,
    );
  return (
    <div>
      <div style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 8px' }}>
        {count('changed')} changed · {count('added')} added · {count('passed')} passed
        {count('skipped') ? ` · ${count('skipped')} skipped` : ''}
      </div>
      {notable.length === 0 ? (
        <p style={{ color: '#1a8917', fontSize: 13 }}>
          No differences across {rows.length} stories.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {notable.map((r) => (
            <li key={r.storyId}>
              <button
                type="button"
                onClick={() => onSelect(r.storyId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  background: 'transparent',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                <StatusBadge status={r.status} />
                <span style={{ flex: 1, textAlign: 'left', fontSize: 12 }}>
                  {r.title} / {r.name}
                </span>
                {r.status === 'changed' && (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    {r.mismatchedPixels.toLocaleString()} px
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type ScanState = {
  busy: boolean;
  progress?: { done: number; total: number };
  rows?: ScanRow[];
  scope?: ScanScope;
  note?: string;
  error?: string;
};

function Panel(): React.ReactElement {
  const state = useStorybookState();
  const api = useStorybookApi();
  const storyId = state.storyId;
  const parameters = useParameter<VrtStoryParameters>('vrt', {});
  const [mode, setMode] = useState<DiffMode>('ref');
  const [ref, setRef] = useState('HEAD');
  const [busy, setBusy] = useState<null | 'compare' | 'snapshot'>(null);
  const [result, setResult] = useState<DiffResponse | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState>({ busy: false });
  const reqId = useRef(0);

  const emit = useChannel({
    [VRT_LIVE_RESPONSE]: (resp: DiffResponse) => {
      if (resp.requestId !== String(reqId.current)) return;
      setBusy(null);
      setResult(resp);
    },
    [VRT_LIVE_SNAPSHOT_SET_DONE]: (resp: { requestId: string; ok: boolean }) => {
      if (resp.requestId !== String(reqId.current)) return;
      setBusy(null);
      setNote(
        resp.ok ? 'Snapshot baseline set — edit, then Compare.' : 'Could not snapshot this story.',
      );
    },
    [VRT_LIVE_SCAN_PROGRESS]: (p: ScanProgress) => {
      if (p.requestId !== String(reqId.current)) return;
      setScan((s) => ({ ...s, progress: { done: p.done, total: p.total } }));
    },
    [VRT_LIVE_SCAN_RESPONSE]: (r: ScanResponse) => {
      if (r.requestId !== String(reqId.current)) return;
      setScan({
        busy: false,
        rows: r.rows,
        ...(r.scope ? { scope: r.scope } : {}),
        ...(r.note ? { note: r.note } : {}),
        ...(r.error ? { error: r.error } : {}),
      });
    },
  });

  useEffect(() => {
    setResult(null);
    setNote(null);
  }, [storyId]);

  const send = (event: string, extra: Record<string, unknown>): void => {
    if (!storyId) return;
    const id = String(++reqId.current);
    setNote(null);
    emit(event, {
      requestId: id,
      storyId,
      sbUrl: window.location.origin,
      parameters,
      ...extra,
    });
  };

  const compare = (): void => {
    setBusy('compare');
    setResult(null);
    send(VRT_LIVE_REQUEST, { mode, ...(mode === 'ref' ? { ref } : {}) });
  };
  const setBaseline = (): void => {
    setBusy('snapshot');
    send(VRT_LIVE_SNAPSHOT_SET, {});
  };
  const runScan = (scope: ScanScope): void => {
    const id = String(++reqId.current);
    setScan({ busy: true, progress: { done: 0, total: 0 }, scope });
    setResult(null);
    setNote(null);
    emit(VRT_LIVE_SCAN_REQUEST, {
      requestId: id,
      sbUrl: window.location.origin,
      mode,
      scope,
      ...(mode === 'ref' ? { ref } : {}),
    });
  };

  if (!storyId) {
    return <div style={{ padding: 16, color: '#6b7280' }}>Select a story to compare.</div>;
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {(['ref', 'snapshot'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                border: 'none',
                padding: '5px 10px',
                fontSize: 12,
                cursor: 'pointer',
                background: mode === m ? '#0a7ea4' : 'transparent',
                color: mode === m ? '#fff' : '#374151',
              }}
            >
              {m === 'ref' ? 'Git ref' : 'Snapshot'}
            </button>
          ))}
        </div>

        {mode === 'ref' ? (
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="HEAD, main, v1.0…"
            style={{
              padding: '5px 8px',
              fontSize: 12,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              width: 140,
            }}
            aria-label="Git ref to compare against"
          />
        ) : (
          <Button size="small" variant="outline" disabled={busy !== null} onClick={setBaseline}>
            {busy === 'snapshot' ? 'Snapshotting…' : 'Set baseline'}
          </Button>
        )}

        <Button size="small" variant="solid" disabled={busy !== null} onClick={compare}>
          {busy === 'compare' ? 'Capturing…' : 'Compare'}
        </Button>
        <Button
          size="small"
          variant="outline"
          disabled={scan.busy}
          onClick={() => runScan('changed')}
        >
          {scan.busy && scan.scope === 'changed' ? 'Scanning…' : 'Scan changed'}
        </Button>
        <Button size="small" variant="outline" disabled={scan.busy} onClick={() => runScan('all')}>
          {scan.busy && scan.scope === 'all' ? 'Scanning…' : 'Scan all'}
        </Button>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{storyId}</span>
      </div>

      {(scan.busy || scan.rows || scan.error || scan.note) && (
        <div style={{ marginTop: 12, borderBottom: '1px solid #e5e7eb', paddingBottom: 12 }}>
          {scan.busy ? (
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              Scanning {scan.scope === 'changed' ? 'changed stories' : 'all stories'}{' '}
              {mode === 'ref' ? `vs ${ref}` : 'vs snapshots'}…
              {scan.progress && scan.progress.total > 0
                ? ` ${scan.progress.done}/${scan.progress.total}`
                : ''}
            </p>
          ) : scan.error ? (
            <p style={{ color: '#d92d20', fontSize: 13 }}>Scan failed: {scan.error}</p>
          ) : (
            <>
              {scan.note && (
                <p style={{ color: '#b45309', fontSize: 13, margin: '0 0 8px' }}>{scan.note}</p>
              )}
              {scan.rows && scan.rows.length > 0 && (
                <ScanList rows={scan.rows} onSelect={(id) => api.selectStory(id)} />
              )}
            </>
          )}
        </div>
      )}

      {note && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>{note}</p>}

      <div style={{ marginTop: 16 }}>
        {busy === 'compare' ? (
          <p style={{ color: '#6b7280' }}>Capturing current render…</p>
        ) : result ? (
          <Result data={result} />
        ) : (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>
            {mode === 'ref'
              ? 'Compare the current render against the committed baseline at a git ref.'
              : 'Set a baseline, edit your component, then Compare to see what moved.'}
          </p>
        )}
      </div>
    </div>
  );
}

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: 'VRT Live',
    match: ({ viewMode }) => viewMode === 'story',
    render: ({ active }) => (
      <AddonPanel active={!!active}>
        <Panel />
      </AddonPanel>
    ),
  });
});
