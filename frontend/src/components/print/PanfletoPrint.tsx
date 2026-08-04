import React from 'react';
import { PrintButton } from './PrintButton';
import { type SnapshotPayload, type SnapshotTable, formatPublishedDate } from '@/lib/snapshot';
import type { ThemeConfig } from '@/contexts/PublishContext';
import type { PublicSiteChartData } from '@/components/publish/PublicSite';

/**
 * M8.5 F3.2b — versão PANFLETO imprimível (decisão D3: divulgação).
 *
 * Contraponto deliberado do acadêmico: aqui é o VISUAL. Número grande, cor do
 * tema, e o gráfico entra como FIGURA colorida (o SVG congelado do publish), não
 * como tabela de números. É pra pendurar / distribuir, não pra citar.
 *
 * Fidelidade (lição BUG-CHART01): puxa a cor do `snap.theme` de verdade — paleta
 * quente Mora (pergaminho + terracota/bordô/sálvia por preset). O paper é o fundo
 * (a marca rejeita o inorgânico / banda-escura-fria); a cor pulsa no accent e nos
 * SVG (paleta Okabe-Ito fixa, decisão G2).
 *
 * Honestidade: os números grandes são TOTAIS REAIS (`total_rows`, que é o total
 * verdadeiro mesmo com a amostra truncada); os gráficos carregam os próprios
 * avisos de top-N; "Destaques" é rotulado como seleção, nunca como o conjunto todo.
 *
 * Mecanismo (D1): `@media print` + `window.print()`; o browser gera o PDF. Nada
 * no backend, nada no ZIP. `print-color-adjust: exact` faz a cor sair no papel.
 */
export function PanfletoPrint({ snap }: { snap: SnapshotPayload }) {
  const t = snap.theme;
  const tables = snap.tables.filter((x) => !x.error);
  const charts = (snap.charts ?? []).filter((c) => !c.error && c.svg);
  const date = formatPublishedDate(snap.created_at);
  const lead = snap.description?.trim() || t.copy?.hero_sub || '';

  const totalRegistros = tables.reduce((acc, x) => acc + (x.total_rows || 0), 0);
  const stats: { value: string; label: string }[] = [
    { value: totalRegistros.toLocaleString('pt-BR'), label: totalRegistros === 1 ? 'registro' : 'registros' },
    { value: tables.length.toLocaleString('pt-BR'), label: tables.length === 1 ? 'coleção' : 'coleções' },
  ];
  if (charts.length > 0) {
    stats.push({ value: charts.length.toLocaleString('pt-BR'), label: charts.length === 1 ? 'visualização' : 'visualizações' });
  }

  // Destaques: primeira tabela com linhas; só uma amostra editorial (rotulada).
  const featured = tables.find((x) => x.rows.length > 0);

  return (
    <>
      <style>{CSS}</style>
      <PrintButton />
      <article
        className="pf"
        style={{ background: t.colors.bg, color: t.colors.ink, fontFamily: t.typography.body.family }}
      >
        {/* Capa */}
        <header className="pf-hero">
          <div
            className="pf-eyebrow"
            style={{ fontFamily: t.typography.mono.family, color: t.colors.accent }}
          >
            Panorama · Versão {snap.version_number} · {date}
          </div>
          <h1
            className="pf-title"
            style={{
              fontFamily: t.typography.display.family,
              fontStyle: t.typography.display.italic ? 'italic' : 'normal',
              fontWeight: t.typography.display.weight,
              color: t.colors.ink,
            }}
          >
            {snap.owner.workspace_name}
          </h1>
          {lead ? (
            <p className="pf-lead" style={{ color: t.colors.muted }}>{lead}</p>
          ) : null}
          <div className="pf-rule" style={{ background: t.colors.accent }} />
        </header>

        {/* Números grandes — faixa no accent (cor no papel via print-color-adjust) */}
        <section
          className="pf-statstrip"
          style={{ background: t.colors.accent, color: t.colors.bg, borderRadius: t.layout.radius }}
        >
          {stats.map((s, i) => (
            <div key={i} className="pf-stat">
              <div
                className="pf-stat-num"
                style={{ fontFamily: t.typography.display.family, fontStyle: t.typography.display.italic ? 'italic' : 'normal' }}
              >
                {s.value}
              </div>
              <div className="pf-stat-label" style={{ fontFamily: t.typography.mono.family }}>{s.label}</div>
            </div>
          ))}
        </section>

        {/* Gráficos coloridos — o centro do panfleto */}
        {charts.map((c, i) => (
          <ChartFigure key={`c-${i}`} theme={t} chart={c} />
        ))}

        {/* Destaques (seleção editorial, rotulada) */}
        {featured ? <Featured theme={t} table={featured} /> : null}

        <footer
          className="pf-foot"
          style={{ fontFamily: t.typography.mono.family, color: t.colors.muted, borderTop: `1px solid ${t.colors.rule}33` }}
        >
          <span>{t.copy?.footer_note ?? ''}</span>
          <span>Publicado via Atlas · v{snap.version_number}</span>
        </footer>
      </article>
    </>
  );
}

function ChartFigure({ theme: t, chart }: { theme: ThemeConfig; chart: PublicSiteChartData }) {
  return (
    <figure
      className="pf-chart"
      style={{ background: t.colors.surface, border: `1px solid ${t.colors.rule}22`, borderRadius: t.layout.radius }}
    >
      {/* SVG congelado do publish — 100% nosso e escapado no gerador (mesma
          justificativa do único dangerouslySetInnerHTML do repo, no PublicSite).
          O título já vem desenhado DENTRO do SVG (chart_svg.py) e no tema, então
          NÃO repetimos numa figcaption — senão dobra (o PublicSite dobra hoje: h2
          + título do SVG; anotado pra varredura de fidelidade pós-1.0). */}
      <div className="pf-chart-svg" dangerouslySetInnerHTML={{ __html: chart.svg! }} />
      {chart.warnings && chart.warnings.length > 0 ? (
        <p className="pf-note" style={{ fontFamily: t.typography.body.family, color: t.colors.muted }}>
          {chart.warnings.join(' · ')}
        </p>
      ) : null}
    </figure>
  );
}

function Featured({ theme: t, table }: { theme: ThemeConfig; table: SnapshotTable }) {
  const cols = table.columns.filter((c) => c.name !== 'id');
  const titleCol = cols[0];
  const metaCol = cols[1];
  const rows = table.rows.slice(0, 5);
  if (!titleCol || rows.length === 0) return null;
  return (
    <section className="pf-block">
      <h2
        className="pf-h2"
        style={{ fontFamily: t.typography.display.family, fontStyle: t.typography.display.italic ? 'italic' : 'normal', color: t.colors.ink }}
      >
        Destaques
      </h2>
      <div>
        {rows.map((row, i) => (
          <article key={i} className="pf-feat" style={{ borderTop: i === 0 ? 'none' : `1px solid ${t.colors.rule}22` }}>
            <span className="pf-feat-num" style={{ fontFamily: t.typography.mono.family, color: t.colors.accent }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <div
                className="pf-feat-title"
                style={{ fontFamily: t.typography.display.family, fontStyle: t.typography.display.italic ? 'italic' : 'normal', color: t.colors.ink }}
              >
                {String(row[titleCol.name] ?? '')}
              </div>
              {metaCol && row[metaCol.name] != null && String(row[metaCol.name]) !== '' ? (
                <div className="pf-feat-meta" style={{ color: t.colors.muted }}>{String(row[metaCol.name])}</div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      <p className="pf-note" style={{ fontFamily: t.typography.body.family, color: t.colors.muted }}>
        Seleção de {rows.length} de {table.total_rows.toLocaleString('pt-BR')} · {table.name}.
      </p>
    </section>
  );
}

const CSS = `
.pf { max-width: 760px; margin: 0 auto; padding: 56px 40px 80px; line-height: 1.5; }
.pf-hero { margin-bottom: 32px; }
.pf-eyebrow { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; margin-bottom: 20px; }
.pf-title { font-size: 60px; line-height: 0.98; margin: 0; letter-spacing: -0.01em; }
.pf-lead { font-size: 20px; line-height: 1.45; margin: 22px 0 0; max-width: 560px; }
.pf-rule { height: 4px; width: 88px; margin-top: 28px; }

.pf-statstrip { display: flex; gap: 8px; padding: 28px 32px; margin: 0 0 40px; flex-wrap: wrap; }
.pf-stat { flex: 1 1 120px; min-width: 120px; }
.pf-stat-num { font-size: 46px; line-height: 1; font-variant-numeric: tabular-nums; }
.pf-stat-label { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; margin-top: 8px; opacity: 0.9; }

.pf-chart { margin: 0 0 28px; padding: 24px; }
/* O SVG congelado tem largura FIXA (chart_svg.py) e é mais largo que a coluna.
   Rolagem horizontal não existe no papel: sem escalar, a impressão CORTA a
   borda direita — junto com a legenda "agregado sobre N linhas", que é
   justamente a prova de honestidade. Escala pelo viewBox (que o gerador emite). */
.pf-chart-svg { max-width: 100%; }
.pf-chart-svg svg { display: block; width: 100%; height: auto; }
.pf-note { font-size: 12px; margin: 12px 0 0; }

.pf-block { margin: 40px 0 0; }
.pf-h2 { font-size: 26px; margin: 0 0 16px; }
.pf-feat { display: grid; grid-template-columns: auto 1fr; gap: 18px; padding: 16px 0; align-items: baseline; }
.pf-feat-num { font-size: 11px; letter-spacing: 0.12em; }
.pf-feat-title { font-size: 21px; line-height: 1.2; }
.pf-feat-meta { font-size: 13px; margin-top: 4px; }

.pf-foot { display: flex; justify-content: space-between; gap: 16px; margin-top: 56px; padding-top: 16px; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; }

@media print {
  .no-print { display: none !important; }
  @page { margin: 1.4cm; }
  /* faz a cor (faixa de stats, accent) sair no PDF em vez de virar branco */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .pf { max-width: none; margin: 0; padding: 0; }
  .pf-statstrip, .pf-chart, .pf-block, .pf-feat { page-break-inside: avoid; }
  .pf-hero { page-break-after: avoid; }
}
`;
