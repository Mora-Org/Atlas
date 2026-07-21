'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import { usePublish, ChartSelection } from '@/contexts/PublishContext';
import { LiveChartPreview } from './LiveChartPreview';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

interface ViewInfo {
  id: number;
  table_id: number;
  name: string;
  group_by: string;
  operation: string;
  metric_column: string | null;
}

/** M8.5 F2.2b — o chart builder.
 *
 *  O gráfico é REFERÊNCIA a uma view salva (decisão G0): o admin escolhe uma
 *  view da F1, dá um título, e adiciona à publicação. O preview VIVO usa
 *  recharts (que só funciona no browser — daí ser dead-code até agora); o que
 *  vai pro público é o SVG congelado pelo backend, NÃO este recharts. Os dois
 *  desenham a mesma barra sobre o mesmo agregado (mesmo endpoint /preview), mas
 *  não são pixel-iguais — o custo aceito na decisão D1.
 */
export function ChartsTab() {
  const { token } = useAuth();
  const { state, dispatch } = usePublish();
  const [views, setViews] = useState<ViewInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/views/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/views/me ${r.status}`);
        return r.json();
      })
      .then((data: ViewInfo[]) => {
        setViews(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [token]);

  const setCharts = useCallback(
    (charts: ChartSelection[]) => dispatch({ type: 'SET_CHARTS', charts }),
    [dispatch],
  );

  const addChart = (view: ViewInfo) => {
    const next: ChartSelection[] = [
      ...state.charts,
      {
        view_id: view.id,
        title: view.name,
        chart_type: 'bar',
        order: state.charts.length,
      },
    ];
    setCharts(next);
  };

  const removeChart = (viewId: number) => {
    setCharts(
      state.charts
        .filter((c) => c.view_id !== viewId)
        .map((c, i) => ({ ...c, order: i })),
    );
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...state.charts];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setCharts(next.map((c, i) => ({ ...c, order: i })));
  };

  const setTitle = (viewId: number, title: string) => {
    setCharts(state.charts.map((c) => (c.view_id === viewId ? { ...c, title } : c)));
  };

  const viewById = new Map(views.map((v) => [v.id, v]));
  const usedIds = new Set(state.charts.map((c) => c.view_id));
  const available = views.filter((v) => !usedIds.has(v.id));

  if (loading) return <p style={{ ...monoLabel, padding: 24 }}>carregando views…</p>;
  if (error) return <p style={{ padding: 24, color: 'var(--fg-danger, #c0392b)' }}>{error}</p>;

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* gráficos já na publicação */}
      <section>
        <p style={{ ...monoLabel, marginBottom: 12 }}>Gráficos nesta publicação</p>
        {state.charts.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
            Nenhum gráfico ainda. Adicione a partir de uma view salva abaixo.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {state.charts.map((c, idx) => {
              const v = viewById.get(c.view_id);
              return (
                <div
                  key={c.view_id}
                  style={{
                    border: '1px solid var(--border, #e0e0e0)',
                    borderRadius: 8,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={c.title}
                      onChange={(e) => setTitle(c.view_id, e.target.value)}
                      aria-label="Título do gráfico"
                      style={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: 600,
                        padding: '6px 8px',
                        border: '1px solid var(--border, #e0e0e0)',
                        borderRadius: 6,
                        background: 'var(--bg, #fff)',
                        color: 'var(--fg, #111)',
                      }}
                    />
                    <button onClick={() => move(idx, -1)} disabled={idx === 0}
                      aria-label="Mover pra cima" style={iconBtn}>↑</button>
                    <button onClick={() => move(idx, 1)} disabled={idx === state.charts.length - 1}
                      aria-label="Mover pra baixo" style={iconBtn}>↓</button>
                    <button onClick={() => removeChart(c.view_id)}
                      aria-label="Remover gráfico" style={{ ...iconBtn, color: 'var(--fg-danger, #c0392b)' }}>✕</button>
                  </div>
                  {v ? (
                    <>
                      <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                        view “{v.name}” · {v.operation}
                        {v.metric_column ? ` de ${v.metric_column}` : ''} por {v.group_by}
                      </p>
                      <LiveChartPreview viewId={c.view_id} />
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--fg-danger, #c0392b)' }}>
                      A view #{c.view_id} não existe mais. Remova este gráfico.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* adicionar a partir de uma view salva */}
      <section>
        <p style={{ ...monoLabel, marginBottom: 12 }}>Adicionar de uma view salva</p>
        {views.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
            Você ainda não salvou nenhuma view. Crie uma na tela de dados de uma tabela.
          </p>
        ) : available.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
            Todas as views já estão na publicação.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {available.map((v) => (
              <button
                key={v.id}
                onClick={() => addChart(v)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--border, #e0e0e0)',
                  borderRadius: 6,
                  background: 'var(--bg, #fff)',
                  color: 'var(--fg, #111)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                + {v.name}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  border: '1px solid var(--border, #e0e0e0)',
  borderRadius: 6,
  background: 'var(--bg, #fff)',
  color: 'var(--fg, #111)',
  cursor: 'pointer',
  fontSize: 14,
};
