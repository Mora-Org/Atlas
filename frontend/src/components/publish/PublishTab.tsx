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
  const { state } = usePublish();

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
              {state.active_version_id ?? '—'}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span style={monoLabel}>Rascunho</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: state.is_dirty ? 'var(--accent-text)' : 'var(--fg-muted)' }}>
              {state.is_dirty ? 'modificado' : 'sincronizado'}
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
          Histórico de versões e rollback entram no próximo PR.
          Por enquanto, o botão <em>Publicar mudanças</em> no topo da página dispara o snapshot
          (já integrado com o backend no PR4).
        </p>
      </section>
    </div>
  );
}
