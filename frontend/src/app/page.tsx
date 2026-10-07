'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Button, Eyebrow, Hairline, Icon, MMonogram, OwlGlyph, SectionNum } from '@/components/ui'
import type { IconName } from '@/components/ui'

// Exemplo da prévia do hero. Dado ilustrativo, não vem do banco.
const SAMPLE_ROWS = [
  ['Dom Casmurro', 'Machado de Assis', '1899'],
  ['Vidas Secas', 'Graciliano Ramos', '1938'],
  ['Grande Sertão: Veredas', 'Guimarães Rosa', '1956'],
  ['A Hora da Estrela', 'Clarice Lispector', '1977'],
]

const STEPS: { num: string; icon: IconName; title: string; desc: string }[] = [
  {
    num: '01',
    icon: 'table',
    title: 'Estruture',
    desc: 'Crie tabelas e colunas pelo navegador. O Atlas cria a tabela de verdade no Postgres. Se o dado já existe, importe um .sql, CSV ou XLSX; as chaves estrangeiras viram relações.',
  },
  {
    num: '02',
    icon: 'edit',
    title: 'Edite',
    desc: 'Cada tabela ganha formulário, filtro e campos de imagem e arquivo. Ninguém precisa abrir um terminal para corrigir uma linha.',
  },
  {
    num: '03',
    icon: 'users',
    title: 'Divida o trabalho',
    desc: 'O master convida administradores. Cada administrador dá a moderadores acesso tabela por tabela.',
  },
  {
    num: '04',
    icon: 'upload',
    title: 'Publique',
    desc: 'O conteúdo vira um site com abas, filtro por coluna, paginação e download em Excel. Ou baixe tudo num ZIP e hospede onde quiser.',
  },
]

const DEV_FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'network', title: 'Esquema visual', desc: 'Diagrama das tabelas e relações, exportável em PNG ou DDL.' },
  { icon: 'lock', title: 'Chaves de API', desc: 'Somente leitura, com escopo por tabela. Nada é liberado por padrão.' },
  { icon: 'grid', title: 'Gráficos e impressos', desc: 'Agregações viram gráfico, panfleto ou versão acadêmica para imprimir.' },
  { icon: 'list', title: 'Auditoria', desc: 'Quem mudou o quê e quando fica registrado.' },
]

const mono: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
}

function SamplePreview() {
  return (
    <figure
      aria-label="Exemplo de tabela publicada pelo Atlas"
      style={{
        margin: 0,
        background: 'var(--bg-surface)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--rule)' }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--rule)' }} />
        ))}
        <span style={{ ...mono, fontSize: 10, letterSpacing: '0.08em', textTransform: 'none', marginLeft: 10 }}>
          atlas / acervo
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 14px', borderBottom: '1px solid var(--rule)' }}>
        {['Início', 'acervo', 'autores'].map(t => {
          const active = t === 'acervo'
          return (
            <span
              key={t}
              style={{
                ...mono,
                fontSize: 10,
                padding: '10px 10px',
                color: active ? 'var(--fg-primary)' : 'var(--fg-muted)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {t}
            </span>
          )
        })}
      </div>

      <div style={{ padding: '14px 14px 6px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-page)',
            fontSize: 12,
            color: 'var(--fg-muted)',
          }}
        >
          <Icon name="filter" size={12} />
          Filtrar por autor
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['título', 'autor', 'ano'].map((h, i) => (
              <th
                key={h}
                style={{
                  ...mono,
                  fontSize: 10,
                  fontWeight: 400,
                  textAlign: i === 2 ? 'right' : 'left',
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--rule)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SAMPLE_ROWS.map(([title, author, year]) => (
            <tr key={title}>
              <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--rule-faint)', fontFamily: 'var(--font-display)', fontSize: 15 }}>
                {title}
              </td>
              <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--rule-faint)', color: 'var(--fg-secondary)' }}>
                {author}
              </td>
              <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--rule-faint)', color: 'var(--fg-secondary)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {year}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
        <span style={{ ...mono, fontSize: 10, letterSpacing: '0.08em', textTransform: 'none' }}>4 de 4 linhas · 25 por página</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-text)' }}>
          <Icon name="download" size={12} />
          Excel
        </span>
      </div>
    </figure>
  )
}

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--fg-primary)' }}>
      <style>{`
        .home-wrap { max-width: 1200px; margin: 0 auto; padding-left: 32px; padding-right: 32px; }
        .home-hero { display: grid; grid-template-columns: 1.05fr 1fr; gap: 72px; align-items: center; }
        .home-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 40px; }
        .home-dev { display: grid; grid-template-columns: 1fr 1.1fr; gap: 80px; align-items: start; }
        .home-dev-list { display: grid; grid-template-columns: 1fr 1fr; gap: 28px 40px; }
        .home-nav-link { font-family: var(--font-sans); font-size: 13px; color: var(--fg-secondary); text-decoration: none; }
        .home-nav-link:hover { color: var(--fg-primary); }
        @media (max-width: 960px) {
          .home-hero, .home-dev { grid-template-columns: 1fr; gap: 56px; }
          .home-steps { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 600px) {
          .home-wrap { padding-left: 16px; padding-right: 16px; }
          .home-steps, .home-dev-list { grid-template-columns: 1fr; }
          .home-nav-link { display: none; }
        }
      `}</style>

      <header className="home-wrap" style={{ paddingTop: 24, paddingBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'inherit', textDecoration: 'none' }}>
          <MMonogram size={28} color="var(--accent-text)" />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>Atlas</span>
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link href="/explore" className="home-nav-link">Explorar</Link>
          <Link href="/admin" className="home-nav-link">Painel</Link>
          <Link href="/login" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="sm">Entrar</Button>
          </Link>
        </nav>
      </header>

      <Hairline strong my={0} />

      <main className="paper-texture">
        <section className="home-wrap home-hero" style={{ paddingTop: 96, paddingBottom: 104 }}>
          <div>
            <Eyebrow accent style={{ marginBottom: 24 }}>
              Atlas · código aberto · Mora Org
            </Eyebrow>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: 'clamp(44px, 5.6vw, 76px)',
                lineHeight: 1.02,
                letterSpacing: 'var(--tracking-display)',
                margin: '0 0 28px',
                fontVariationSettings: '"opsz" 144, "SOFT" 60',
                textWrap: 'balance',
              }}
            >
              Seu banco de dados, legível para{' '}
              <em style={{ color: 'var(--accent-text)' }}>quem nunca escreveu SQL.</em>
            </h1>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.6,
                color: 'var(--fg-secondary)',
                maxWidth: 520,
                margin: '0 0 40px',
                textWrap: 'pretty',
              }}
            >
              O Atlas cria tabelas reais no Postgres a partir do navegador, monta a tela de edição e publica o conteúdo como site. Quem vive de SQL continua com o SQL; o resto da equipe trabalha pela interface.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <Link href="/login" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="lg" iconRight="arrow-right">
                  Entrar no painel
                </Button>
              </Link>
              <a href="https://github.com/Mora-Org/Atlas" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <Button variant="secondary" size="lg" iconRight="external-link">
                  Ver o código
                </Button>
              </a>
            </div>
            <p style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', margin: '22px 0 0' }}>
              Acesso por convite · Apache 2.0
            </p>
          </div>

          <SamplePreview />
        </section>
      </main>

      <Hairline strong my={0} />

      <section className="home-wrap" style={{ paddingTop: 96, paddingBottom: 96 }}>
        <Eyebrow accent style={{ marginBottom: 18 }}>Como funciona</Eyebrow>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(32px, 4vw, 48px)',
            lineHeight: 1.1,
            letterSpacing: 'var(--tracking-h1)',
            margin: '0 0 64px',
            maxWidth: 640,
            textWrap: 'balance',
          }}
        >
          Da primeira coluna ao site publicado.
        </h2>
        <div className="home-steps">
          {STEPS.map(s => (
            <article key={s.num} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SectionNum>{s.num}</SectionNum>
                <Icon name={s.icon} size={18} color="var(--accent-text)" />
              </div>
              <Hairline my={0} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 24, lineHeight: 1.2, margin: '6px 0 0' }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--fg-secondary)', margin: 0 }}>
                {s.desc}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        <div className="home-wrap home-dev" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <div>
            <Eyebrow accent style={{ marginBottom: 18 }}>Para quem vive no SQL</Eyebrow>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: 'clamp(28px, 3.4vw, 40px)',
                lineHeight: 1.15,
                letterSpacing: 'var(--tracking-h2)',
                margin: '0 0 20px',
                textWrap: 'balance',
              }}
            >
              A interface não esconde o banco.
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--fg-secondary)', margin: '0 0 28px', maxWidth: 460 }}>
              As tabelas são tabelas de verdade no Postgres. Dá para ler o mesmo dado por API, sem passar pela tela.
            </p>
            <pre
              style={{
                margin: 0,
                padding: '16px 18px',
                background: 'var(--bg-sunken)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.7,
                color: 'var(--fg-secondary)',
                overflowX: 'auto',
              }}
            >
              <span style={{ color: 'var(--accent-text)' }}>GET</span> /api/acervo{'\n'}
              Authorization: Bearer mora_<span style={{ color: 'var(--fg-muted)' }}>…</span>
            </pre>
          </div>

          <div className="home-dev-list">
            {DEV_FEATURES.map(f => (
              <div key={f.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Icon name={f.icon} size={18} color="var(--accent-text)" />
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 20, lineHeight: 1.25, margin: 0 }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg-secondary)', margin: 0 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-wrap" style={{ paddingTop: 96, paddingBottom: 96, display: 'flex', gap: 40, alignItems: 'flex-start' }}>
        <OwlGlyph size={12} opacity={0.6} caption="mora" />
        <div style={{ maxWidth: 640 }}>
          <Eyebrow accent style={{ marginBottom: 18 }}>Sobre o nome</Eyebrow>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 'clamp(22px, 2.4vw, 28px)',
              lineHeight: 1.45,
              color: 'var(--fg-primary)',
              margin: '0 0 20px',
              textWrap: 'pretty',
            }}
          >
            Mora vem do latim e quer dizer demora, pausa. É o tempo que uma coisa densa pede para ser feita com cuidado.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--fg-secondary)', margin: 0 }}>
            O Atlas nasceu de um projeto de pesquisa que precisava publicar um banco de dados sem obrigar ninguém a aprender SQL. O código é aberto sob Apache 2.0; faça seu fork.
          </p>
        </div>
      </section>

      <Hairline strong my={0} />

      <footer className="home-wrap" style={{ paddingTop: 32, paddingBottom: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MMonogram size={18} color="var(--fg-muted)" />
          <span style={{ ...mono, fontSize: 10 }}>Mora Org · Atlas</span>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
          <Link href="/explore" className="home-nav-link" style={{ display: 'inline' }}>Explorar</Link>
          <a href="https://github.com/Mora-Org/Atlas" target="_blank" rel="noopener noreferrer" className="home-nav-link" style={{ display: 'inline' }}>GitHub</a>
          <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener noreferrer" className="home-nav-link" style={{ display: 'inline' }}>Apache 2.0</a>
        </div>
      </footer>
    </div>
  )
}
