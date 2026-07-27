import React, { useEffect, useRef, useState } from 'react';
import { AddonPanel, Button } from 'storybook/internal/components';
import { addons, types, useChannel, useParameter, useStorybookState } from 'storybook/manager-api';
import {
  type DiffResponse,
  type SnapshotSetResponse,
  VRT_LIVE_REQUEST,
  VRT_LIVE_RESPONSE,
  VRT_LIVE_SNAPSHOT_SET,
  VRT_LIVE_SNAPSHOT_SET_DONE,
} from './channel';
import { classifyResponse, type Pending } from './correlation';
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

  const hasBaseline = data.baseline !== null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <StatusBadge status={data.status} />
        <span style={{ fontSize: 13 }}>
          {data.status === 'added'
            ? 'No baseline yet — press "Set baseline" to freeze this render.'
            : data.status === 'passed'
              ? 'Matches the baseline.'
              : `${data.mismatchedPixels.toLocaleString()} px differ (${(data.mismatchRatio * 100).toFixed(2)}%)`}
        </span>
        {!data.stabilized && (
          <span style={{ fontSize: 11, color: '#b45309' }}>⚠ did not stabilize</span>
        )}
      </div>

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

function Panel(): React.ReactElement {
  const state = useStorybookState();
  const storyId = state.storyId;
  const parameters = useParameter<VrtStoryParameters>('vrt', {});
  const [busy, setBusy] = useState<null | 'compare' | 'snapshot'>(null);
  const [result, setResult] = useState<DiffResponse | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [hasBaseline, setHasBaseline] = useState(false);

  // Refs, not closure captures: the channel handlers must always see the
  // story that is on screen right now, and the request they belong to.
  const storyIdRef = useRef(storyId);
  storyIdRef.current = storyId;
  const nextId = useRef(0);
  const pendingCompare = useRef<Pending>(null);
  const pendingSnapshot = useRef<Pending>(null);

  const emit = useChannel({
    [VRT_LIVE_RESPONSE]: (resp: DiffResponse) => {
      const verdict = classifyResponse({
        pending: pendingCompare.current,
        response: resp,
        currentStoryId: storyIdRef.current,
      });
      if (verdict === 'ignore') return;
      pendingCompare.current = null;
      setBusy(null);
      if (verdict === 'apply') setResult(resp);
    },
    [VRT_LIVE_SNAPSHOT_SET_DONE]: (resp: SnapshotSetResponse) => {
      const verdict = classifyResponse({
        pending: pendingSnapshot.current,
        response: resp,
        currentStoryId: storyIdRef.current,
      });
      if (verdict === 'ignore') return;
      pendingSnapshot.current = null;
      setBusy(null);
      if (verdict !== 'apply') return;
      setHasBaseline(resp.ok);
      setNote(
        resp.ok
          ? 'Baseline set — edit your component, then press Compare.'
          : `Could not snapshot this story${resp.error ? `: ${resp.error}` : '.'}`,
      );
    },
  });

  // Switching stories abandons whatever was in flight: its answer is about a
  // story we are no longer showing.
  useEffect(() => {
    pendingCompare.current = null;
    pendingSnapshot.current = null;
    setBusy(null);
    setResult(null);
    setNote(null);
    setHasBaseline(false);
  }, [storyId]);

  const start = (event: string, slot: React.RefObject<Pending>): void => {
    if (!storyId) return;
    const requestId = String(++nextId.current);
    slot.current = { requestId, storyId };
    emit(event, { requestId, storyId, sbUrl: window.location.origin, parameters });
  };

  const setBaseline = (): void => {
    setBusy('snapshot');
    setNote(null);
    start(VRT_LIVE_SNAPSHOT_SET, pendingSnapshot);
  };
  const compare = (): void => {
    setBusy('compare');
    setNote(null);
    setResult(null);
    start(VRT_LIVE_REQUEST, pendingCompare);
  };

  if (!storyId) {
    return <div style={{ padding: 16, color: '#6b7280' }}>Select a story to compare.</div>;
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button size="small" variant="outline" disabled={busy !== null} onClick={setBaseline}>
          {busy === 'snapshot' ? 'Capturing…' : hasBaseline ? 'Re-set baseline' : 'Set baseline'}
        </Button>
        <Button size="small" variant="solid" disabled={busy !== null} onClick={compare}>
          {busy === 'compare' ? 'Capturing…' : 'Compare'}
        </Button>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{storyId}</span>
      </div>

      {note && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>{note}</p>}

      <div style={{ marginTop: 16 }}>
        {busy === 'compare' ? (
          <p style={{ color: '#6b7280' }}>Capturing current render…</p>
        ) : result ? (
          <Result data={result} />
        ) : (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>
            Press <b>Set baseline</b> to freeze how this story looks now, edit your component, then
            press <b>Compare</b> to see what moved. Baselines live in memory for this dev-server
            session — nothing is written to the repo.
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
