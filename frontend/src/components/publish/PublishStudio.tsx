'use client';

import React, { useEffect, useState } from 'react';
import { usePublish, LayoutType } from '@/contexts/PublishContext';
import { useAuth } from '@/components/AuthContext';
import { AppearanceTab } from './AppearanceTab';
import { ContentTab } from './ContentTab';
import { ChartsTab } from './ChartsTab';
import { PublishTab } from './PublishTab';
import { PublicSite, type PublicSiteTableData, type PublicSiteChartData } from './PublicSite';

type TabId = 'appearance' | 'content' | 'charts' | 'publish';
type Viewport = 'desktop' | 'tablet' | 'mobile';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

export function PublishStudio() {
  const { state, publishing, publishError, publishChanges, patch, versions } = usePublish();
  const { user, token } = useAuth();
  const [tab, setTab] = useState<TabId>('appearance');
  const [previewLayout, setPreviewLayout] = useState<LayoutType>(state.theme_config.layout.default_table_layout);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [confirming, setConfirming] = useState(false);
  const [pendingLabel, setPendingLabel] = useState('');
  const [previewTables, setPreviewTables] = useState<PublicSiteTableData[]>([]);
  const [previewCharts, setPreviewCharts] = useState<PublicSiteChartData[]>([]);

  const workspaceName = user?.workspace_name ?? 'Workspace';
  const workspaceSlug = user?.workspace_slug ?? 'workspace';

  // PR4b/M8 F3: busca os dados reais das tabelas selecionadas pro preview
  // (antes era tables={[]} → caía no SAMPLE_TABLE sem mídia). Reusa
  // _build_snapshot_payload no backend → preview == publish, zero drift.
  // Só depende da SELEÇÃO (tema é aplicado client-side via themeConfig).
  useEffect(() => {
    if (!token) return;
    // Pode haver gráfico sobre tabela pública sem tabela selecionada — por isso
    // o preview roda se houver tabela OU gráfico.
    if (state.tables.length === 0 && state.charts.length === 0) {
      setPreviewTables([]);
      setPreviewCharts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/publications/me/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          // F2.2b: manda os MESMOS charts que o publish congelaria — o preview
          // mostra o gráfico congelado (não o recharts vivo), então o admin vê
          // exatamente o que vai pro público. preview == publish.
          body: JSON.stringify({ table_selection: state.tables, charts: state.charts }),
        });
        if (!r.ok) throw new Error(`preview ${r.status}`);
        const snap: {
          tables?: Omit<PublicSiteTableData, 'table_id'>[];
          charts?: PublicSiteChartData[];
        } = await r.json();
        if (cancelled) return;
        setPreviewTables(
          (snap.tables ?? []).map((t, idx) => ({ ...t, table_id: idx })),
        );
        setPreviewCharts(snap.charts ?? []);
      } catch (e) {
        // Falha de preview não trava o Studio — cai no estado vazio (dado-exemplo).
        if (!cancelled) {
          console.error('preview:', e);
          setPreviewTables([]);
          setPreviewCharts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, state.tables, state.charts]);

  const nextNumber = versions.reduce((m, v) => Math.max(m, v.version_number), 0) + 1;

  const submitPublish = async () => {
    await publishChanges(pendingLabel.trim() || undefined);
    setPendingLabel('');
    setConfirming(false);
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--bg-page)', color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)' }}
    >
      {/* Topbar */}
      <header
        className="flex items-center justify-between px-8 py-3"
        style={{ borderBottom: '1px solid var(--rule-faint)', background: 'var(--bg-page)' }}
      >
        <div className="flex items-center gap-4">
          <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, color: 'var(--accent-text)' }}>M</span>
          <div className="flex items-center gap-2" style={{ ...monoLabel, fontSize: 11 }}>
            <span>Dashboard</span>
            <span>›</span>
            <span>{workspaceName}</span>
            <span>›</span>
            <span style={{ color: 'var(--fg-primary)' }}>Site público</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill dirty={state.is_dirty} />
          <a
            href={`/${workspaceSlug}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-3 py-1 rounded"
            style={{
              ...monoLabel,
              fontSize: 10,
              textDecoration: 'none',
              background: 'color-mix(in oklab, var(--accent) 14%, transparent)',
              color: 'var(--accent-text)',
            }}
          >
            ↗ /{workspaceSlug}
          </a>
          <PublishButton
            dirty={state.is_dirty}
            publishing={publishing}
            onPublish={() => setConfirming(true)}
          />
        </div>
      </header>

      {confirming && (
        <div
          className="flex items-center gap-2 px-8 py-2"
          style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--rule-faint)' }}
        >
          <span style={{ ...monoLabel, fontSize: 10 }}>Rótulo</span>
          <input
            value={pendingLabel}
            onChange={(e) => setPendingLabel(e.target.value)}
            placeholder="opcional — ex.: ajuste de eventos"
            disabled={publishing}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !publishing) submitPublish();
              if (e.key === 'Escape') {
                setConfirming(false);
                setPendingLabel('');
              }
            }}
            className="flex-1 px-2 py-1 rounded text-sm"
            style={{
              fontFamily: 'var(--font-sans)',
              background: 'var(--bg-page)',
              border: '1px solid var(--rule)',
              color: 'var(--fg-primary)',
              maxWidth: 360,
            }}
          />
          <button
            onClick={submitPublish}
            disabled={publishing}
            className="px-3 py-1 rounded text-sm font-medium"
            style={{
              fontFamily: 'var(--font-sans)',
              background: 'var(--accent)',
              color: 'var(--fg-inverse)',
              border: 'none',
              cursor: publishing ? 'not-allowed' : 'pointer',
              opacity: publishing ? 0.7 : 1,
            }}
          >
            {publishing ? 'Publicando…' : `Publicar v${nextNumber}`}
          </button>
          <button
            onClick={() => {
              setConfirming(false);
              setPendingLabel('');
            }}
            disabled={publishing}
            className="px-3 py-1 rounded"
            style={{
              ...monoLabel,
              fontSize: 10,
              background: 'transparent',
              color: 'var(--fg-muted)',
              border: '1px solid var(--rule)',
              cursor: publishing ? 'not-allowed' : 'pointer',
            }}
          >
            cancelar
          </button>
        </div>
      )}

      {publishError && (
        <div
          className="px-8 py-2"
          style={{
            background: 'color-mix(in oklab, var(--raw-ruby, #852E47) 12%, transparent)',
            color: 'var(--raw-ruby, #852E47)',
            ...monoLabel,
            fontSize: 11,
            borderBottom: '1px solid var(--rule-faint)',
          }}
        >
          ⚠ Falha ao publicar: {publishError}
        </div>
      )}

      {/* Tabs */}
      <nav className="flex px-8" style={{ borderBottom: '1px solid var(--rule-faint)' }}>
        {[
          { id: 'appearance' as const, num: '02', label: 'Aparência' },
          { id: 'content' as const, num: '03', label: 'Conteúdo' },
          { id: 'charts' as const, num: '04', label: 'Gráficos' },
          { id: 'publish' as const, num: '05', label: 'Publicação' },
        ].map((it) => {
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className="px-4 py-3 flex items-center gap-2"
              style={{
                ...monoLabel,
                color: active ? 'var(--fg-primary)' : 'var(--fg-muted)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
                background: 'transparent',
              }}
            >
              <span style={{ color: 'var(--fg-faint)', fontSize: 9 }}>{it.num}</span>
              {it.label}
              {state.is_dirty && it.id === tab && (
                <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--accent)', marginLeft: 2 }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Body: controles (420) + preview (1fr) */}
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '420px 1fr' }}>
        <aside
          className="overflow-auto px-7"
          style={{ borderRight: '1px solid var(--rule-faint)', background: 'var(--bg-surface)' }}
        >
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'content' && <ContentTab />}
          {tab === 'charts' && <ChartsTab />}
          {tab === 'publish' && <PublishTab />}
        </aside>

        <main
          className="overflow-auto flex flex-col"
          style={{ background: 'var(--bg-sunken)' }}
        >
          <PreviewChrome
            layout={previewLayout}
            setLayout={setPreviewLayout}
            viewport={viewport}
            setViewport={setViewport}
          />
          <div className="flex-1 p-6 flex items-start justify-center">
            <div
              style={{
                background: 'white',
                border: '1px solid var(--rule)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-raised)',
                overflow: 'hidden',
                transition: 'max-width 240ms',
                width: '100%',
                maxWidth: viewport === 'desktop' ? 1280 : viewport === 'tablet' ? 768 : 390,
              }}
            >
              <PublicSite
                themeConfig={state.theme_config}
                tables={previewTables}
                charts={previewCharts}
                workspaceName={workspaceName}
                workspaceSlug={workspaceSlug}
                previewLayout={previewLayout}
                onCopyEdit={(field, value) => patch(`copy.${field}`, value)}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ─────────────────────── pieces ─────────────────────── */

function StatusPill({ dirty }: { dirty: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        ...monoLabel,
        fontSize: 10,
        background: dirty
          ? 'color-mix(in oklab, var(--raw-goldenrod, #DAA63E) 16%, transparent)'
          : 'color-mix(in oklab, var(--raw-sage, #95A581) 22%, transparent)',
        color: dirty ? 'var(--raw-goldenrod-d, #A87A1F)' : 'var(--raw-sage-d, #5F6E4D)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: dirty ? 'var(--raw-goldenrod, #DAA63E)' : 'var(--raw-sage-d, #5F6E4D)',
        }}
      />
      {dirty ? 'rascunho' : 'sincronizado'}
    </span>
  );
}

function PublishButton({
  dirty,
  publishing,
  onPublish,
}: {
  dirty: boolean;
  publishing: boolean;
  onPublish: () => void;
}) {
  const armed = dirty && !publishing;
  const label = publishing ? 'Publicando…' : dirty ? 'Publicar mudanças' : 'publicado';
  return (
    <button
      disabled={!armed}
      onClick={onPublish}
      className="px-4 py-2 rounded text-sm font-medium flex items-center gap-2"
      style={{
        fontFamily: 'var(--font-sans)',
        background: armed ? 'var(--accent)' : 'var(--bg-elevated)',
        color: armed ? 'var(--fg-inverse)' : 'var(--fg-muted)',
        border: armed ? 'none' : '1px solid var(--rule)',
        cursor: armed ? 'pointer' : 'default',
        opacity: publishing ? 0.7 : 1,
      }}
    >
      {label}
    </button>
  );
}

function PreviewChrome({
  layout,
  setLayout,
  viewport,
  setViewport,
}: {
  layout: LayoutType;
  setLayout: (l: LayoutType) => void;
  viewport: Viewport;
  setViewport: (v: Viewport) => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3"
      style={{
        borderBottom: '1px solid var(--rule-faint)',
        background: 'var(--bg-elevated)',
        ...monoLabel,
      }}
    >
      <ToggleGroup
        value={layout}
        onChange={setLayout}
        options={[
          { v: 'list' as const, label: 'Lista' },
          { v: 'grid' as const, label: 'Grade' },
          { v: 'essay' as const, label: 'Ensaio' },
        ]}
      />
      <ToggleGroup
        value={viewport}
        onChange={setViewport}
        options={[
          { v: 'desktop' as const, label: 'Desk' },
          { v: 'tablet' as const, label: 'Tablet' },
          { v: 'mobile' as const, label: 'Mob' },
        ]}
      />
    </div>
  );
}

function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
}) {
  return (
    <div
      className="inline-flex rounded overflow-hidden"
      style={{ border: '1px solid var(--rule)', background: 'var(--bg-page)' }}
    >
      {options.map((o, i) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className="px-2.5 py-1.5"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              background: active ? 'var(--bg-elevated)' : 'transparent',
              color: active ? 'var(--fg-primary)' : 'var(--fg-muted)',
              borderLeft: i === 0 ? 'none' : '1px solid var(--rule-faint)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
