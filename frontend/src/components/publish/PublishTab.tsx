'use client';

import React, { useState } from 'react';
import { usePublish } from '@/contexts/PublishContext';
import { Pill } from '@/components/ui';

const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

// created_at vem como UTC "naive" do backend (datetime.utcnow, normalmente sem 'Z').
// Normaliza pra UTC antes de formatar pro fuso local.
function fmtDate(iso: string): string {
  const norm = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(norm);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PublishTab() {
  const {
    state,
    loadingDraft,
    publishing,
    versions,
    loadingVersions,
    versionActionId,
    versionError,
    rollbackTo,
    deleteVersion,
  } = usePublish();

  const [confirmingRollback, setConfirmingRollback] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  const rascunhoLabel = publishing
    ? 'publicando…'
    : state.is_dirty
      ? 'modificado'
      : 'sincronizado';
  const rascunhoColor = publishing || state.is_dirty ? 'var(--accent-text)' : 'var(--fg-muted)';

  const activeNumber =
    versions.find((v) => v.id === state.active_version_id)?.version_number ?? null;
  const busy = versionActionId !== null;

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
              {loadingDraft ? '…' : activeNumber != null ? `v${activeNumber}` : '—'}
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
        <div className="flex items-baseline justify-between mb-3">
          <span style={monoLabel}>
            <span style={{ color: 'var(--accent-text)', marginRight: 8 }}>§ II</span>
            Histórico
          </span>
          {versions.length > 0 && (
            <span style={{ ...monoLabel, fontSize: 9 }}>{versions.length} versões</span>
          )}
        </div>

        {versionError && (
          <p className="text-xs mb-3" style={{ color: 'var(--accent-text)' }}>
            {versionError}
          </p>
        )}

        {loadingVersions && versions.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            Carregando versões…
          </p>
        )}

        {!loadingVersions && versions.length === 0 && (
          <p className="text-xs italic" style={{ color: 'var(--fg-muted)' }}>
            Nenhuma versão publicada ainda. Use <em>Publicar mudanças</em> no topo.
          </p>
        )}

        {versions.map((v) => {
          const rowBusy = versionActionId === v.id;
          return (
            <article
              key={v.id}
              className="p-3 mb-2 rounded"
              style={{
                background: 'var(--bg-elevated)',
                border: `1px solid ${v.is_active ? 'var(--accent)' : 'var(--rule)'}`,
                opacity: busy && !rowBusy ? 0.5 : 1,
              }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <div className="flex items-baseline gap-2">
                  <span style={{ ...monoLabel, fontSize: 11, color: 'var(--accent-text)' }}>
                    v{v.version_number}
                  </span>
                  <span style={{ ...monoLabel, fontSize: 9 }}>{fmtDate(v.created_at)}</span>
                </div>
                {v.is_active && (
                  <Pill tone="ok" dot>
                    ativa
                  </Pill>
                )}
              </div>

              <div className="mb-2">
                {v.description ? (
                  <span style={{ fontSize: 13, color: 'var(--fg-primary)' }}>{v.description}</span>
                ) : (
                  <span className="italic" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                    sem rótulo
                  </span>
                )}
              </div>

              {!v.is_active &&
                (confirmingRollback === v.id ? (
                  <ConfirmStrip
                    message={
                      state.is_dirty
                        ? 'Você tem mudanças não publicadas — o rollback vai descartá-las do editor. Voltar pra esta versão?'
                        : 'Voltar pra esta versão? O site público passa a mostrá-la.'
                    }
                    confirmLabel={rowBusy ? 'Voltando…' : 'Confirmar'}
                    disabled={rowBusy}
                    onConfirm={() => {
                      setConfirmingRollback(null);
                      rollbackTo(v.id);
                    }}
                    onCancel={() => setConfirmingRollback(null)}
                  />
                ) : confirmingDelete === v.id ? (
                  <ConfirmStrip
                    message={`Deletar a v${v.version_number} permanentemente? Isso remove o snapshot do Storage.`}
                    confirmLabel={rowBusy ? 'Deletando…' : 'Deletar'}
                    danger
                    disabled={rowBusy}
                    onConfirm={() => {
                      setConfirmingDelete(null);
                      deleteVersion(v.id);
                    }}
                    onCancel={() => setConfirmingDelete(null)}
                  />
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setConfirmingDelete(null);
                        setConfirmingRollback(v.id);
                      }}
                      disabled={busy}
                      className="px-2.5 py-1 rounded text-xs"
                      style={{
                        background: 'var(--accent-soft)',
                        border: '1px solid var(--accent)',
                        color: 'var(--accent-text)',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      Voltar pra esta
                    </button>
                    <button
                      onClick={() => {
                        setConfirmingRollback(null);
                        setConfirmingDelete(v.id);
                      }}
                      disabled={busy}
                      title="Deletar versão"
                      className="w-6 h-6 rounded flex items-center justify-center text-xs"
                      style={{
                        background: 'var(--bg-page)',
                        border: '1px solid var(--rule)',
                        color: 'var(--fg-secondary)',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function ConfirmStrip({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  disabled,
  danger,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className="p-2 rounded"
      style={{ background: 'var(--bg-page)', border: '1px solid var(--rule)' }}
    >
      <p className="text-xs mb-2" style={{ color: 'var(--fg-secondary)', lineHeight: 1.4 }}>
        {message}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={onConfirm}
          disabled={disabled}
          className="px-2.5 py-1 rounded text-xs font-medium"
          style={{
            background: danger ? 'var(--danger, #852E47)' : 'var(--accent)',
            color: 'var(--fg-inverse)',
            border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={disabled}
          className="px-2.5 py-1 rounded text-xs"
          style={{
            background: 'transparent',
            color: 'var(--fg-muted)',
            border: '1px solid var(--rule)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          cancelar
        </button>
      </div>
    </div>
  );
}
