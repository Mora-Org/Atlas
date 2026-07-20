'use client';

import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useAuth } from '@/components/AuthContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Mesma paleta Okabe-Ito do renderizador do backend (chart_svg.SERIES_PALETTE),
// pra o preview vivo bater com o SVG congelado. Se divergir daqui, o admin vê
// uma cor no Studio e outra no público.
const SERIES_PALETTE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7'];
const REST_HATCH = '#9AA0A6';

interface Point {
  category: string;
  value: number | null;
  is_null_group?: boolean;
  is_rest?: boolean;
}
interface Series {
  label: string;
  points: Point[];
  truncated: boolean;
  rest: { value: number | null; category?: string } | null;
}
interface AggData {
  operation: string;
  rest_label: string;
  series: Series[];
}

/** Preview VIVO do gráfico no Studio, com recharts.
 *
 *  recharts só renderiza no browser (é a razão de o público usar SVG congelado
 *  do backend, não recharts). Aqui estamos no browser, então recharts serve —
 *  mas com width/height FIXOS, não ResponsiveContainer (que depende de um
 *  useEffect de medição e pinta vazio no 1º frame; o detalhamento pediu fixo).
 *
 *  Pivota as séries por UNIÃO de categorias, igual o backend: categoria fora do
 *  top-N de um recorte NÃO vira zero (fica sem barra). Isso mantém o preview
 *  honesto do mesmo jeito que o congelado.
 */
export function LiveChartPreview({ viewId }: { viewId: number }) {
  const { token } = useAuth();
  const [data, setData] = useState<AggData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${API}/api/views/me/${viewId}/data`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`view ${viewId} data ${r.status}`);
        return r.json();
      })
      .then((d: AggData) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [token, viewId]);

  if (error) return <p style={{ fontSize: 12, color: 'var(--fg-danger, #c0392b)' }}>{error}</p>;
  if (!data) return <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>carregando…</p>;

  const { rows, seriesLabels } = pivot(data);
  if (rows.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>sem dados pra exibir</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <BarChart width={620} height={300} data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#0000001a" vertical={false} />
        <XAxis dataKey="category" fontSize={11} angle={-30} textAnchor="end" height={60}
          stroke="var(--fg-muted, #777)" />
        <YAxis fontSize={11} stroke="var(--fg-muted, #777)" />
        <Tooltip />
        {seriesLabels.length > 1 && <Legend />}
        {seriesLabels.map((label, i) => (
          <Bar key={label} dataKey={label} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />
        ))}
      </BarChart>
      {data.series.some((s) => s.truncated) && (
        <p style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          categorias cortadas no top-N; o grupo “{data.rest_label}” junta o resto.
          Categoria sem barra num recorte está fora do top-N dele (não é zero).
        </p>
      )}
    </div>
  );
}

/** Pivota séries → linhas {category, [label]: value}. União de categorias.
 *  Ausência de uma categoria num recorte = sem chave (recharts não desenha
 *  barra) — nunca 0, honrando a reconciliação do backend. Exposto pra teste. */
export function pivot(data: AggData): {
  rows: Record<string, string | number>[];
  seriesLabels: string[];
} {
  const seriesLabels = data.series.map((s) => s.label);
  const order: string[] = [];
  const seen = new Set<string>();
  for (const s of data.series) {
    for (const p of s.points) {
      if (!seen.has(p.category)) {
        seen.add(p.category);
        order.push(p.category);
      }
    }
  }
  // "(resto)" por último se algum recorte truncou
  const restLabel = data.rest_label;
  if (data.series.some((s) => s.rest) && !seen.has(restLabel)) order.push(restLabel);

  const rows = order.map((cat) => {
    const row: Record<string, string | number> = { category: cat };
    for (const s of data.series) {
      const p = s.points.find((x) => x.category === cat);
      if (p && p.value !== null) {
        row[s.label] = p.value;
      } else if (cat === restLabel && s.rest && s.rest.value !== null) {
        row[s.label] = s.rest.value;
      }
      // senão: sem chave → recharts não desenha barra (fora do top-N / sem dado)
    }
    return row;
  });
  return { rows, seriesLabels };
}

// (REST_HATCH exportado pra manter paridade visual com o backend em futuras
//  iterações do preview; recharts v1 usa só a paleta de séries.)
export { REST_HATCH };
