import React from 'react';
import { PrintButton } from './PrintButton';
import {
  type SnapshotPayload, type SnapshotTable, citeTable, formatPublishedDate,
} from '@/lib/snapshot';

/**
 * M8.5 F3.2a — versão ACADÊMICA imprimível (decisão D3: sóbria, fontes citadas).
 *
 * Distinção deliberada do panfleto: o acadêmico mostra o DADO (tabelas + os
 * NÚMEROS dos gráficos via alt-table, não a figura colorida) + citação honesta
 * + honestidade M6 F5. Pra citação, não pra divulgação. Serifa, preto no
 * branco, sem cor do tema (documento neutro).
 *
 * Mecanismo (D1): é uma página normal com `@media print`; o `PrintButton`
 * chama `window.print()` e o browser gera o PDF vetorial. Nada é gerado no
 * backend, nada entra no ZIP (o ZIP segue intacto).
 *
 * Honestidade (jurisprudência M6 F5, integral): cada tabela estampa "N de M
 * registros" quando truncada; o cabeçalho estampa versão + data; a citação usa
 * `source` se informado, senão só o metadado — NUNCA fabrica fonte.
 */
export function AcademicPrint({ snap }: { snap: SnapshotPayload }) {
  const tables = snap.tables.filter((t) => !t.error);
  const charts = (snap.charts ?? []).filter((c) => !c.error && c.alt_table);
  const date = formatPublishedDate(snap.created_at);

  return (
    <>
      <style>{CSS}</style>
      <PrintButton />
      <article className="acad">
        <header className="acad-head">
          <h1>{snap.owner.workspace_name}</h1>
          <p className="acad-meta">
            Versão {snap.version_number} · publicado em {date}
          </p>
          {snap.description ? <p className="acad-desc">{snap.description}</p> : null}
        </header>

        {tables.map((t, i) => (
          <TableSection key={`t-${i}`} table={t} />
        ))}

        {charts.map((c, i) => (
          <section key={`c-${i}`} className="acad-block">
            <h2>{c.title}</h2>
            <AltTable alt={c.alt_table!} />
            {c.warnings && c.warnings.length > 0 ? (
              <p className="acad-note">{c.warnings.join(' · ')}</p>
            ) : null}
          </section>
        ))}

        <section className="acad-block acad-refs">
          <h2>Fontes</h2>
          <ol>
            {tables.map((t, i) => (
              <li key={`ref-${i}`}>{citeTable(snap, t)}</li>
            ))}
          </ol>
        </section>

        <footer className="acad-foot">
          {snap.theme?.copy?.footer_note ?? ''}
          {snap.theme?.copy?.footer_note ? ' · ' : ''}
          Gerado a partir da versão publicada {snap.version_number} ({date}).
        </footer>
      </article>
    </>
  );
}

function TableSection({ table: t }: { table: SnapshotTable }) {
  const shown = t.rows.length;
  return (
    <section className="acad-block">
      <h2>{t.name}</h2>
      <div className="acad-scroll">
        <table>
          <thead>
            <tr>
              {t.columns.map((c) => (
                <th key={c.name} scope="col">{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((row, ri) => (
              <tr key={ri}>
                {t.columns.map((c) => (
                  <td key={c.name}>{fmtCell(row[c.name])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Honestidade M6 F5: se truncou, diz N de M — o impresso circula solto. */}
      <p className="acad-note">
        {t.truncated
          ? `Mostrando ${shown.toLocaleString('pt-BR')} de ${t.total_rows.toLocaleString('pt-BR')} registros (amostra da versão publicada).`
          : `${t.total_rows.toLocaleString('pt-BR')} registros.`}
      </p>
    </section>
  );
}

function AltTable({ alt }: { alt: { header: string[]; rows: string[][] } }) {
  return (
    <div className="acad-scroll">
      <table>
        <thead>
          <tr>{alt.header.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {alt.rows.map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

const CSS = `
.acad {
  max-width: 720px; margin: 0 auto; padding: 48px 32px 96px;
  font-family: 'IBM Plex Serif', Georgia, 'Times New Roman', serif;
  color: #111; background: #fff; line-height: 1.5;
}
.acad h1 { font-size: 26px; margin: 0 0 4px; font-weight: 600; }
.acad h2 { font-size: 17px; margin: 0 0 10px; font-weight: 600; }
.acad-meta { font-size: 13px; color: #555; margin: 0; }
.acad-desc { font-size: 14px; color: #333; margin: 12px 0 0; font-style: italic; }
.acad-head { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 28px; }
.acad-block { margin: 0 0 32px; }
.acad-scroll { max-width: 100%; overflow-x: auto; }
.acad table { border-collapse: collapse; font-size: 12.5px; width: 100%; }
.acad th { text-align: left; padding: 6px 14px 6px 0; border-bottom: 1px solid #111; font-weight: 600; }
.acad td { padding: 5px 14px 5px 0; border-bottom: 1px solid #ddd; font-variant-numeric: tabular-nums; }
.acad-note { font-size: 12px; color: #555; margin: 8px 0 0; }
.acad-refs ol { padding-left: 20px; }
.acad-refs li { font-size: 12.5px; margin: 0 0 8px; }
.acad-foot { border-top: 1px solid #ccc; padding-top: 12px; margin-top: 40px; font-size: 11px; color: #777; }

@media print {
  .no-print { display: none !important; }
  @page { margin: 2cm; }
  html, body { background: #fff; }
  .acad { max-width: none; margin: 0; padding: 0; }
  .acad-block, .acad table, tr { page-break-inside: avoid; }
  .acad-head { page-break-after: avoid; }
  /* Na tela a tabela larga rola; no papel, rolagem não existe — sem isto a
     coluna da direita é cortada em silêncio. Quebra a palavra em vez de
     esconder o dado (o impresso circula solto e não pode omitir calado). */
  .acad-scroll { overflow: visible; }
  .acad table { table-layout: fixed; width: 100%; }
  .acad th, .acad td { word-break: break-word; overflow-wrap: anywhere; }
}
`;
