'use client';

import React from 'react';
import { usePublish } from '@/contexts/PublishContext';

const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

export function PublishTab() {
  const { state, loadingDraft, publishing } = usePublish();

  const rascunhoLabel = publishing
    ? 'publicando…'
    : state.is_dirty
      ? 'modificado'
      : 'sincronizado';
  const rascunhoColor = publishing || state.is_dirty ? 'var(--accent-text)' : 'var(--fg-muted)';

  return (
    <div className="flex flex-col">
      <section className="py-5" style={{ borderBottom: '1px solid var(--rule-faint)' }}>
        <div className="mb-3">
          <span style={monoLabel}>
            <span style={{ color: 'var(--accent-text)', marginRight: 8 }}>§ I</span>
            Status
          </span>
        </div>
        <div
          className="p-3 rounded"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--rule)' }}
        >
          <div className="flex items-baseline justify-between mb-1">
            <span style={monoLabel}>Versão ativa</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--fg-primary)' }}>
              {loadingDraft ? '…' : state.active_version_id ?? '—'}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span style={monoLabel}>Rascunho</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: rascunhoColor }}>
              {rascunhoLabel}
            </span>
          </div>
        </div>
      </section>

      <section className="py-5">
        <div className="mb-3">
          <span style={monoLabel}>
            <span style={{ color: 'var(--accent-text)', marginRight: 8 }}>§ II</span>
            Histórico
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--fg-muted)', lineHeight: 1.5 }}>
          Lista de versões e rollback entram no PR #25. O botão{' '}
          <em>Publicar mudanças</em> no topo cria a nova versão e ativa em
          sequência — site público em <code>/{`{slug}`}</code> reflete em
          segundos (snapshot fica no Supabase Storage).
        </p>
      </section>
    </div>
  );
}
