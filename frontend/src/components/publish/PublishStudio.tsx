'use client';

import React, { useState } from 'react';
import { usePublish, LayoutType } from '@/contexts/PublishContext';
import { useAuth } from '@/components/AuthContext';
import { AppearanceTab } from './AppearanceTab';
import { ContentTab } from './ContentTab';
import { PublishTab } from './PublishTab';
import { PublicSite } from './PublicSite';

type TabId = 'appearance' | 'content' | 'publish';
type Viewport = 'desktop' | 'tablet' | 'mobile';

const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

export function PublishStudio() {
  const { state, publishing, publishError, publishChanges, patch } = usePublish();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>('appearance');
  const [previewLayout, setPreviewLayout] = useState<LayoutType>(state.theme_config.layout.default_table_layout);
  const [viewport, setViewport] = useState<Viewport>('desktop');

  const workspaceName = user?.workspace_name ?? 'Workspace';
  const workspaceSlug = user?.workspace_slug ?? 'workspace';

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
            onPublish={() => publishChanges()}
          />
        </div>
      </header>

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
          { id: 'publish' as const, num: '04', label: 'Publicação' },
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
                tables={[]} // PR4b vai buscar payload das tabelas selecionadas
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
