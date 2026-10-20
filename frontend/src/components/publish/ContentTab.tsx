'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import {
  usePublish, LayoutType, TableSelection, ColumnPlacement, ColumnSelection, TableRole,
} from '@/contexts/PublishContext';
import { isMediaBackendType } from '@/lib/columnTypes';

interface ColumnInfo {
  name: string;
  data_type: string;
}

interface TableInfo {
  id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  columns?: ColumnInfo[];
  /** `GET /tables/` já devolve — usado pro aviso de teto do snapshot. */
  meta?: { row_count: number };
}

interface RelationInfo {
  from_table: string;
  to_table: string;
  from_column_name: string | null;
  to_column_name: string | null;
}

/** Espelha `publication_storage.MAX_ROWS_PER_TABLE`. */
const TETO_LINHAS = 10_000;

// "Cartões", não "Grade": a colocação de coluna diz "Na listagem", e dois
// "grade" na mesma tela falavam de coisas diferentes (1.4).
const LAYOUTS: { v: LayoutType; label: string }[] = [
  { v: 'tabela', label: 'Tabela' },
  { v: 'list', label: 'Lista' },
  { v: 'grid', label: 'Cartões' },
  { v: 'essay', label: 'Ensaio' },
];

const PLACEMENTS: { v: ColumnPlacement; label: string }[] = [
  { v: 'grade', label: 'Na listagem' },
  { v: 'ficha', label: 'Só na ficha' },
  { v: 'oculta', label: 'Oculta' },
];

const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

const campo: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '4px 6px',
  background: 'var(--bg-page)',
  border: '1px solid var(--rule)',
  borderRadius: 4,
  color: 'var(--fg-primary)',
};

const dica: React.CSSProperties = { fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.4 };

/** Config das colunas por inteiro, na ordem da tabela. Coluna sem config vale
 *  "Na listagem" com o nome interno — igual ao backend, então coluna nova
 *  nunca some calada. */
function colunasConfig(sel: TableSelection, info: TableInfo): ColumnSelection[] {
  const atual = new Map((sel.columns ?? []).map((c) => [c.name, c]));
  return (info.columns ?? []).map((c) => ({
    name: c.name,
    label: atual.get(c.name)?.label ?? '',
    placement: atual.get(c.name)?.placement ?? 'grade',
  }));
}

export function ContentTab() {
  const { token } = useAuth();
  const { state, dispatch } = usePublish();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [ligacoes, setLigacoes] = useState<Set<string>>(new Set());
  const [aberta, setAberta] = useState<number | null>(null);
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
    // 1.4: só pra avisar que coluna de ligação oculta continua no código da
    // página. Falhar aqui não trava nada.
    fetch(`${API}/api/relations/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rels: RelationInfo[]) => {
        const s = new Set<string>();
        for (const r of rels) {
          if (r.from_column_name) s.add(`${r.from_table}.${r.from_column_name}`);
          if (r.to_column_name) s.add(`${r.to_table}.${r.to_column_name}`);
        }
        setLigacoes(s);
      })
      .catch(() => undefined);
  }, [token]);

  const selectedById = new Map(state.tables.map((t) => [t.table_id, t]));

  const toggle = (table: TableInfo) => {
    const current = selectedById.get(table.id);
    if (current) {
      // Tirar da seleção apaga a configuração dela; recarregar a página volta
      // à versão publicada (declarado no plano da 1.4).
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

  const atualizar = (table_id: number, patch: Partial<TableSelection>) => {
    const next = state.tables.map((t) => (t.table_id === table_id ? { ...t, ...patch } : t));
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

  const mudarColuna = (sel: TableSelection, info: TableInfo, nome: string, patch: Partial<ColumnSelection>) => {
    const cols = colunasConfig(sel, info).map((c) => (c.name === nome ? { ...c, ...patch } : c));
    // Coluna que vira oculta não pode seguir como nome do registro.
    const titulo = patch.placement === 'oculta' && sel.title_column === nome ? null : sel.title_column;
    atualizar(sel.table_id, { columns: cols, title_column: titulo });
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
          const role: TableRole = sel.role ?? 'aba';
          const cols = colunasConfig(sel, info);
          const candidatosTitulo = cols.filter(
            (c) => c.placement !== 'oculta'
              && !isMediaBackendType(info.columns?.find((x) => x.name === c.name)?.data_type ?? ''),
          );
          const expandida = aberta === sel.table_id;
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

              {/* 1.4 — aba ou só nas fichas */}
              <div className="grid grid-cols-2 gap-1 mb-2">
                {([['aba', 'Aba'], ['ficha', 'Só nas fichas']] as [TableRole, string][]).map(([v, rot]) => (
                  <Opcao key={v} ativa={role === v} onClick={() => atualizar(sel.table_id, { role: v })}>{rot}</Opcao>
                ))}
              </div>
              {role === 'ficha' && (
                <p className="mb-2" style={dica}>
                  Não vira aba. Aparece nas fichas das tabelas ligadas a ela, e o dado é publicado
                  inteiro.
                </p>
              )}

              <label className="block mb-2">
                <span style={{ ...monoLabel, fontSize: 9 }}>Nome na tela</span>
                <input
                  value={sel.label ?? ''}
                  onChange={(e) => atualizar(sel.table_id, { label: e.target.value })}
                  placeholder={info.name}
                  maxLength={120}
                  style={campo}
                />
              </label>

              <label className="block mb-2">
                <span style={{ ...monoLabel, fontSize: 9 }}>Nome do registro</span>
                <select
                  value={sel.title_column ?? ''}
                  onChange={(e) => atualizar(sel.table_id, { title_column: e.target.value || null })}
                  style={campo}
                >
                  <option value="">Automático</option>
                  {candidatosTitulo.map((c) => (
                    <option key={c.name} value={c.name}>{c.label || c.name}</option>
                  ))}
                </select>
              </label>

              {role === 'aba' && (
                <div className="grid grid-cols-4 gap-1 mb-2">
                  {LAYOUTS.map((l) => (
                    <Opcao key={l.v} ativa={sel.layout === l.v} onClick={() => atualizar(sel.table_id, { layout: l.v })}>
                      {l.label}
                    </Opcao>
                  ))}
                </div>
              )}

              <button
                onClick={() => setAberta(expandida ? null : sel.table_id)}
                className="w-full text-left py-1"
                style={{ ...monoLabel, fontSize: 9 }}
                aria-expanded={expandida}
              >
                {expandida ? '▾' : '▸'} Campos ({cols.length})
              </button>
              {expandida && (
                <div className="mt-1 flex flex-col gap-2">
                  {cols.map((c) => {
                    const deLigacao = ligacoes.has(`${info.name}.${c.name}`);
                    return (
                      <div key={c.name} className="grid gap-1" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <span
                          className="truncate"
                          title={c.name}
                          style={{ gridColumn: '1 / -1', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-secondary)' }}
                        >
                          {c.name}
                        </span>
                        <input
                          value={c.label}
                          onChange={(e) => mudarColuna(sel, info, c.name, { label: e.target.value })}
                          placeholder="nome na tela"
                          maxLength={120}
                          aria-label={`Nome na tela de ${c.name}`}
                          style={campo}
                        />
                        <select
                          value={c.placement}
                          onChange={(e) => mudarColuna(sel, info, c.name, { placement: e.target.value as ColumnPlacement })}
                          aria-label={`Onde ${c.name} aparece`}
                          style={campo}
                        >
                          {PLACEMENTS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                        </select>
                        {c.placement === 'oculta' && deLigacao && (
                          <span style={{ ...dica, gridColumn: '1 / -1' }}>
                            Coluna de ligação: some da tela, mas continua no código da página.
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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

function Opcao({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="py-1 rounded text-xs"
      style={{
        background: ativa ? 'var(--accent-soft)' : 'var(--bg-page)',
        border: `1px solid ${ativa ? 'var(--accent)' : 'var(--rule)'}`,
        color: ativa ? 'var(--accent-text)' : 'var(--fg-secondary)',
      }}
    >
      {children}
    </button>
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
