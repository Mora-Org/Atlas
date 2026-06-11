'use client';

import React, { useState } from 'react';
import { usePublish, type VersionResponse } from '@/contexts/PublishContext';
import { useAuth } from '@/components/AuthContext';
import { Pill } from '@/components/ui';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

  const { token } = useAuth();

  const [confirmingRollback, setConfirmingRollback] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  // Export estático (M6 Fase 5): qualquer versão do histórico vira ZIP.
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [confirmingExport, setConfirmingExport] = useState<{ id: number; warning: string } | null>(null);
  const [lastExport, setLastExport] = useState<{ fileName: string; sizeKb: number; versionNumber: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function doExport(v: VersionResponse) {
    setExportingId(v.id);
    setExportError(null);
    try {
      // Route handler do Next (mesma origem) — repassa o token pro backend.
      const r = await fetch(`/api/export/${v.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Falha ao gerar o pacote (HTTP ${r.status})`);
      }
      const blob = await r.blob();
      const cd = r.headers.get('content-disposition') ?? '';
      const fileName = /filename="([^"]+)"/.exec(cd)?.[1] ?? `export-v${v.version_number}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setLastExport({ fileName, sizeKb: Math.max(1, Math.round(blob.size / 1024)), versionNumber: v.version_number });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Falha ao exportar');
    } finally {
      setExportingId(null);
    }
  }

  async function handleExportClick(v: VersionResponse) {
    setConfirmingRollback(null);
    setConfirmingDelete(null);
    setConfirmingExport(null);
    setExportError(null);
    setExportingId(v.id);
    try {
      // Decisão #5: avisar ANTES de gerar quando a versão tem tabela truncada
      // — o ZIP congela a truncagem. O snapshot diz a verdade por tabela.
      const r = await fetch(`${API}/api/publications/me/versions/${v.id}/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Não consegui ler o snapshot (HTTP ${r.status})`);
      const snap = (await r.json()) as {
        tables?: { name: string; truncated: boolean; rows: unknown[]; total_rows: number }[];
      };
      const trunc = (snap.tables ?? []).filter((t) => t.truncated);
      if (trunc.length > 0) {
        const det = trunc.map((t) => `${t.name} (${t.rows.length} de ${t.total_rows} linhas)`).join(', ');
        setExportingId(null);
        setConfirmingExport({
          id: v.id,
          warning: `Esta versão tem tabelas truncadas: ${det}. O ZIP congela essas linhas pra sempre. Exportar mesmo assim?`,
        });
        return;
      }
      await doExport(v);
    } catch (e) {
      setExportingId(null);
      setExportError(e instanceof Error ? e.message : 'Falha ao exportar');
    }
  }

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

              {confirmingRollback === v.id && !v.is_active ? (
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
              ) : confirmingDelete === v.id && !v.is_active ? (
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
              ) : confirmingExport?.id === v.id ? (
                <ConfirmStrip
                  message={confirmingExport.warning}
                  confirmLabel="Exportar mesmo assim"
                  disabled={exportingId !== null}
                  onConfirm={() => {
                    setConfirmingExport(null);
                    doExport(v);
                  }}
                  onCancel={() => setConfirmingExport(null)}
                />
              ) : (
                <div className="flex items-center gap-1">
                  {!v.is_active && (
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
                  )}
                  <button
                    onClick={() => handleExportClick(v)}
                    disabled={busy || exportingId !== null}
                    title="Baixar esta versão como site estático (ZIP)"
                    className="px-2.5 py-1 rounded text-xs"
                    style={{
                      background: 'var(--bg-page)',
                      border: '1px solid var(--rule)',
                      color: 'var(--fg-secondary)',
                      cursor: busy || exportingId !== null ? 'not-allowed' : 'pointer',
                      opacity: busy || (exportingId !== null && exportingId !== v.id) ? 0.5 : 1,
                    }}
                  >
                    {exportingId === v.id ? 'Gerando…' : 'Exportar'}
                  </button>
                  {!v.is_active && (
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
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {(lastExport || exportError) && (
        <section className="py-5" style={{ borderTop: '1px solid var(--rule-faint)' }}>
          <div className="mb-3">
            <span style={monoLabel}>
              <span style={{ color: 'var(--accent-text)', marginRight: 8 }}>§ III</span>
              Export
            </span>
          </div>

          {exportError && (
            <p className="text-xs mb-3" style={{ color: 'var(--accent-text)' }}>
              ⚠ {exportError}
            </p>
          )}

          {lastExport && (
            <div
              className="p-3 rounded"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--rule)' }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-primary)' }}>
                  {lastExport.fileName}
                </span>
                <span style={{ ...monoLabel, fontSize: 9 }}>
                  v{lastExport.versionNumber} · {lastExport.sizeKb} KB
                </span>
              </div>
              <p className="text-xs mb-1" style={{ color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
                O ZIP contém o site completo: <em>index.html</em> (dados embutidos),
                fontes em <em>assets/fonts/</em> e o <em>snapshot.json</em> de arquivo.
              </p>
              <p className="text-xs" style={{ color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                Pra abrir: descompacte e dê duplo-clique no <em>index.html</em> — funciona
                offline. Pra hospedar: suba a pasta em qualquer host estático
                (Vercel, Netlify, GitHub Pages, S3) — sem build, o site já está pronto.
                Detalhes no README.md dentro do pacote.
              </p>
            </div>
          )}
        </section>
      )}
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
