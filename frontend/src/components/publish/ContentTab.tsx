'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import { usePublish, LayoutType, TableSelection } from '@/contexts/PublishContext';

interface TableInfo {
  id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  /** `GET /tables/` já devolve — usado pro aviso de teto do snapshot. */
  meta?: { row_count: number };
}

/** Espelha `publication_storage.MAX_ROWS_PER_TABLE`. */
const TETO_LINHAS = 10_000;

const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

export function ContentTab() {
  const { token } = useAuth();
  const { state, dispatch } = usePublish();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    fetch(`${API}/tables/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data: TableInfo[]) => {
        setTables(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [token]);

  const selectedById = new Map(state.tables.map((t) => [t.table_id, t]));

  const toggle = (table: TableInfo) => {
    const current = selectedById.get(table.id);
    if (current) {
      const next = state.tables
        .filter((t) => t.table_id !== table.id)
        .map((t, i) => ({ ...t, order: i }));
      dispatch({ type: 'SET_TABLES', tables: next });
    } else {
      const next: TableSelection[] = [
        ...state.tables,
        { table_id: table.id, order: state.tables.length, layout: state.theme_config.layout.default_table_layout },
      ];
      dispatch({ type: 'SET_TABLES', tables: next });
    }
  };

  const setLayout = (table_id: number, layout: LayoutType) => {
    const next = state.tables.map((t) => (t.table_id === table_id ? { ...t, layout } : t));
    dispatch({ type: 'SET_TABLES', tables: next });
  };

  const move = (table_id: number, delta: -1 | 1) => {
    const sorted = [...state.tables].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((t) => t.table_id === table_id);
    const swap = idx + delta;
    if (idx < 0 || swap < 0 || swap >= sorted.length) return;
    [sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]];
    dispatch({ type: 'SET_TABLES', tables: sorted.map((t, i) => ({ ...t, order: i })) });
  };

  const selectedSorted = [...state.tables].sort((a, b) => a.order - b.order);
  const unselected = tables.filter((t) => !selectedById.has(t.id));

  return (
    <div className="flex flex-col">
      <section className="py-5" style={{ borderBottom: '1px solid var(--rule-faint)' }}>
        <div className="flex items-baseline justify-between mb-3">
          <span style={monoLabel}>
            <span style={{ color: 'var(--accent-text)', marginRight: 8 }}>§ I</span>
            Tabelas no site
          </span>
          <span style={{ ...monoLabel, fontSize: 9 }}>
            {selectedSorted.length} de {tables.length}
          </span>
        </div>

        {loading && <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>Carregando tabelas…</p>}
        {error && <p className="text-xs" style={{ color: 'var(--accent-text)' }}>{error}</p>}

        {selectedSorted.length === 0 && !loading && (
          <p className="text-xs italic mb-3" style={{ color: 'var(--fg-muted)' }}>
            Nenhuma tabela selecionada. Adicione abaixo.
          </p>
        )}

        {selectedSorted.map((sel, i) => {
          const info = tables.find((t) => t.id === sel.table_id);
          if (!info) return null;
          return (
            <article
              key={sel.table_id}
              className="p-3 mb-2 rounded"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--rule)' }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <div className="flex items-baseline gap-2">
                  <span style={{ ...monoLabel, fontSize: 9, color: 'var(--accent-text)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--fg-primary)' }}>
                    {info.name}
                  </span>
                </div>
                <div className="flex gap-1">
                  <IconBtn disabled={i === 0} onClick={() => move(sel.table_id, -1)}>↑</IconBtn>
                  <IconBtn disabled={i === selectedSorted.length - 1} onClick={() => move(sel.table_id, 1)}>↓</IconBtn>
                  <IconBtn onClick={() => toggle(info)}>×</IconBtn>
                </div>
              </div>

              {/* Aviso de teto (1.3). O snapshot leva no máximo 10.000 linhas
                  por tabela; acima disso o site publicado mostraria um recorte
                  sem dizer. O aviso aparece ANTES de publicar — descobrir isso
                  depois, no site no ar, é tarde. */}
              {(info.meta?.row_count ?? 0) > TETO_LINHAS && (
                <p
                  className="text-xs mb-2 p-2 rounded"
                  style={{
                    background: 'var(--warn-bg)',
                    color: 'var(--fg-secondary)',
                    fontFamily: 'var(--font-display)',
                    lineHeight: 1.45,
                  }}
                >
                  <strong>{info.meta!.row_count.toLocaleString('pt-BR')} registros</strong> — o site
                  publicado leva os primeiros {TETO_LINHAS.toLocaleString('pt-BR')}. Para um acervo
                  deste tamanho vale mais a pena uma base própria; fale com o responsável pelo Atlas
                  antes de publicar.
                </p>
              )}
              <div className="grid grid-cols-3 gap-1">
                {(['tabela', 'list', 'grid', 'essay'] as LayoutType[]).map((l) => {
                  const active = sel.layout === l;
                  return (
                    <button
                      key={l}
                      onClick={() => setLayout(sel.table_id, l)}
                      className="py-1 rounded text-xs"
                      style={{
                        background: active ? 'var(--accent-soft)' : 'var(--bg-page)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
                        color: active ? 'var(--accent-text)' : 'var(--fg-secondary)',
                      }}
                    >
                      {{ tabela: 'Tabela', list: 'Lista', grid: 'Grade', essay: 'Ensaio' }[l]}
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>

      {unselected.length > 0 && (
        <section className="py-5">
          <div className="flex items-baseline justify-between mb-3">
            <span style={monoLabel}>
              <span style={{ color: 'var(--accent-text)', marginRight: 8 }}>§ II</span>
              Disponíveis
            </span>
          </div>
          {unselected.map((t) => (
            <button
              key={t.id}
              onClick={() => toggle(t)}
              className="w-full text-left p-2 mb-1 rounded flex items-baseline gap-2 transition-colors hover:opacity-80"
              style={{ border: '1px dashed var(--rule)' }}
            >
              <span style={{ ...monoLabel, fontSize: 9 }}>+</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--fg-primary)' }}>{t.name}</span>
              {t.description && (
                <span className="ml-2 truncate" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                  {t.description}
                </span>
              )}
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function IconBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-6 h-6 rounded flex items-center justify-center text-xs"
      style={{
        background: 'var(--bg-page)',
        border: '1px solid var(--rule)',
        color: 'var(--fg-secondary)',
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
