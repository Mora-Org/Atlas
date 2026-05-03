'use client'
import React, { useState } from 'react'
import {
  Icon, Eyebrow, Hairline, Button, Pill, Card,
  Field, Input, Select, Textarea, SectionNum,
} from '@/components/ui'
import type { IconName } from '@/components/ui'
import type { Accent, Mode } from '@/components/ThemeContext'

const ACCENT_COLORS: { key: Accent; hex: string }[] = [
  { key: 'goldenrod', hex: '#DAA63E' },
  { key: 'sage',      hex: '#95A581' },
  { key: 'ruby',      hex: '#852E47' },
  { key: 'nectar',    hex: '#C2441C' },
]

const ALL_ICONS: IconName[] = [
  'home', 'menu', 'close', 'arrow-left', 'arrow-right', 'arrow-up', 'arrow-down',
  'chevron_down', 'chevron_up', 'chevron_left', 'chevron_right',
  'plus', 'minus', 'search', 'filter', 'sort', 'edit', 'trash', 'copy',
  'download', 'upload', 'refresh', 'save',
  'database', 'table', 'columns', 'rows', 'import',
  'check', 'check-circle', 'x-circle', 'warning', 'info',
  'user', 'users', 'shield', 'lock', 'logout', 'qr',
  'layout', 'sidebar', 'grid', 'list',
  'settings', 'bell', 'link', 'external-link', 'folder', 'file', 'palette', 'sun', 'moon',
]

const S = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-page)',
    color: 'var(--fg-primary)',
    fontFamily: 'var(--font-sans)',
    padding: '48px 32px',
  } as React.CSSProperties,
  section: {
    marginBottom: '56px',
  } as React.CSSProperties,
  sectionTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.18em',
    color: 'var(--fg-muted)',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '10px',
  },
  label: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--fg-muted)',
    marginTop: '4px',
    textAlign: 'center' as const,
  },
}

export default function TokensDevPage() {
  const [localMode, setLocalMode] = useState<Mode>('light')
  const [localAccent, setLocalAccent] = useState<Accent>('goldenrod')
  const [inputVal, setInputVal] = useState('')
  const [selectVal, setSelectVal] = useState('a')
  const [textareaVal, setTextareaVal] = useState('')

  // Apply theme to root (affects entire page since we're in the same document)
  const applyLocal = (m: Mode, a: Accent) => {
    document.documentElement.setAttribute('data-theme', m)
    document.documentElement.setAttribute('data-accent', a)
  }

  const handleMode = (m: Mode) => { setLocalMode(m); applyLocal(m, localAccent) }
  const handleAccent = (a: Accent) => { setLocalAccent(a); applyLocal(localMode, a) }

  return (
    <div style={S.page}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '48px' }}>
          <Eyebrow accent num="00">Mora Design System</Eyebrow>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '38px', marginTop: '8px', marginBottom: '4px' }}>
            Token Preview
          </h1>
          <p style={{ color: 'var(--fg-muted)', fontSize: '14px' }}>
            Storybook lite — todos os primitivos em todas as variantes.
          </p>
        </div>

        {/* Inline Theme Switcher */}
        <div style={{ ...S.section, display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={S.sectionTitle}><span>Mode</span></p>
            <div style={S.row}>
              {(['light', 'dark'] as Mode[]).map(m => (
                <Button
                  key={m}
                  variant={localMode === m ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleMode(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p style={S.sectionTitle}><span>Accent</span></p>
            <div style={S.row}>
              {ACCENT_COLORS.map(a => (
                <button
                  key={a.key}
                  title={a.key}
                  onClick={() => handleAccent(a.key)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: a.hex,
                    border: localAccent === a.key ? '3px solid var(--fg-primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <Hairline strong my={0} />
        <div style={{ height: '48px' }} />

        {/* Palette swatches */}
        <div style={S.section}>
          <p style={S.sectionTitle}><SectionNum>01</SectionNum> Palette — Accent × Mode</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {ACCENT_COLORS.map(a => (
              <div key={a.key}>
                <div style={{ height: '48px', background: a.hex, borderRadius: 'var(--radius-sm)', marginBottom: '4px' }} />
                <div style={{ height: '24px', background: a.hex, opacity: 0.4, borderRadius: 'var(--radius-sm)', marginBottom: '4px' }} />
                <p style={{ ...S.label, textAlign: 'left' }}>{a.key}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px' }}>
            {[
              { label: 'bg-page',    v: 'var(--bg-page)'    },
              { label: 'bg-surface', v: 'var(--bg-surface)'  },
              { label: 'bg-elevated',v: 'var(--bg-elevated)' },
              { label: 'bg-sunken',  v: 'var(--bg-sunken)'   },
              { label: 'fg-primary', v: 'var(--fg-primary)'  },
              { label: 'fg-secondary',v:'var(--fg-secondary)'},
              { label: 'fg-muted',   v: 'var(--fg-muted)'    },
              { label: 'accent',     v: 'var(--accent)'      },
            ].map(s => (
              <div key={s.label}>
                <div style={{ height: '32px', background: s.v, borderRadius: 'var(--radius-sm)', border: '1px solid var(--rule)', marginBottom: '4px' }} />
                <p style={{ ...S.label, textAlign: 'left' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <Hairline strong my={0} />
        <div style={{ height: '48px' }} />

        {/* Typography */}
        <div style={S.section}>
          <p style={S.sectionTitle}><SectionNum>02</SectionNum> Typography</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {([1, 2, 3, 4, 5, 6] as const).map(n => {
              const Tag = `h${n}` as React.ElementType
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--fg-muted)', width: '24px', flexShrink: 0 }}>h{n}</span>
                  <Tag>Fraunces display heading {n}</Tag>
                </div>
              )
            })}
            <Hairline my={8} />
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', lineHeight: 1.6 }}>
              IBM Plex Sans — body text. The quick brown fox jumps over the lazy dog.
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
              Secondary — 13px. System metadata, labels, descriptions.
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--fg-muted)' }}>
              IBM Plex Mono — code, tokens, timestamps. 0123456789
            </p>
          </div>
        </div>

        <Hairline strong my={0} />
        <div style={{ height: '48px' }} />

        {/* Icons */}
        <div style={S.section}>
          <p style={S.sectionTitle}><SectionNum>03</SectionNum> Icons ({ALL_ICONS.length})</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: '8px' }}>
            {ALL_ICONS.map(name => (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '10px 4px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--rule-faint)' }}>
                <Icon name={name} size={18} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--fg-muted)', textAlign: 'center', wordBreak: 'break-all' }}>{name}</span>
              </div>
            ))}
          </div>
        </div>

        <Hairline strong my={0} />
        <div style={{ height: '48px' }} />

        {/* Buttons */}
        <div style={S.section}>
          <p style={S.sectionTitle}><SectionNum>04</SectionNum> Button</p>
          {(['primary', 'secondary', 'ghost', 'danger', 'link'] as const).map(v => (
            <div key={v} style={{ marginBottom: '12px' }}>
              <p style={{ ...S.label, textAlign: 'left', marginBottom: '6px' }}>{v}</p>
              <div style={S.row}>
                {(['sm', 'md', 'lg'] as const).map(sz => (
                  <Button key={sz} variant={v} size={sz} icon="palette" iconRight={undefined}>
                    {sz} — {v}
                  </Button>
                ))}
                <Button variant={v} size="md" disabled>disabled</Button>
                <Button variant={v} size="md" icon="plus">with icon</Button>
              </div>
            </div>
          ))}
        </div>

        <Hairline strong my={0} />
        <div style={{ height: '48px' }} />

        {/* Pills */}
        <div style={S.section}>
          <p style={S.sectionTitle}><SectionNum>05</SectionNum> Pill</p>
          <div style={S.row}>
            {(['accent', 'muted', 'ok', 'warn', 'err', 'master', 'admin', 'moderator'] as const).map(t => (
              <div key={t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <Pill tone={t}>{t}</Pill>
                <Pill tone={t} dot>{t} ·</Pill>
              </div>
            ))}
          </div>
        </div>

        <Hairline strong my={0} />
        <div style={{ height: '48px' }} />

        {/* Cards */}
        <div style={S.section}>
          <p style={S.sectionTitle}><SectionNum>06</SectionNum> Card</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <Card>
              <Eyebrow>Normal</Eyebrow>
              <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--fg-secondary)' }}>padding=true, default</p>
            </Card>
            <Card raised>
              <Eyebrow>Raised</Eyebrow>
              <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--fg-secondary)' }}>raised=true, shadow-md</p>
            </Card>
            <Card interactive>
              <Eyebrow accent>Interactive</Eyebrow>
              <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--fg-secondary)' }}>Hover for lift</p>
            </Card>
          </div>
        </div>

        <Hairline strong my={0} />
        <div style={{ height: '48px' }} />

        {/* Eyebrow + SectionNum + Hairline */}
        <div style={S.section}>
          <p style={S.sectionTitle}><SectionNum>07</SectionNum> Eyebrow · Hairline · SectionNum</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Eyebrow>Eyebrow plain</Eyebrow>
            <Eyebrow accent>Eyebrow accent</Eyebrow>
            <Eyebrow num={1}>Eyebrow com num</Eyebrow>
            <Eyebrow num={42} accent>Eyebrow accent + num</Eyebrow>
            <Hairline />
            <Hairline strong />
            <div style={S.row}>
              <SectionNum>§ 01</SectionNum>
              <SectionNum>§ 02</SectionNum>
              <SectionNum>§ 03</SectionNum>
            </div>
          </div>
        </div>

        <Hairline strong my={0} />
        <div style={{ height: '48px' }} />

        {/* Field / Input / Select / Textarea */}
        <div style={S.section}>
          <p style={S.sectionTitle}><SectionNum>08</SectionNum> Field · Input · Select · Textarea</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <Field label="Nome" hint="Seu nome completo">
              <Input value={inputVal} onChange={e => setInputVal(e.target.value)} placeholder="Digite aqui..." />
            </Field>
            <Field label="Com ícone" hint="Busca">
              <Input value={inputVal} onChange={e => setInputVal(e.target.value)} placeholder="Buscar..." icon="search" />
            </Field>
            <Field label="Com erro" error="Campo obrigatório">
              <Input value="" placeholder="Campo vazio..." error="Campo obrigatório" />
            </Field>
            <Field label="Mono">
              <Input value="SELECT * FROM table" onChange={e => setInputVal(e.target.value)} mono />
            </Field>
            <Field label="Select" hint="Escolha uma opção">
              <Select value={selectVal} onChange={e => setSelectVal(e.target.value)}>
                <option value="a">Opção A</option>
                <option value="b">Opção B</option>
                <option value="c">Opção C</option>
              </Select>
            </Field>
            <Field label="Textarea" hint="Texto longo">
              <Textarea value={textareaVal} onChange={e => setTextareaVal(e.target.value)} placeholder="Escreva..." rows={3} />
            </Field>
          </div>
        </div>

      </div>
    </div>
  )
}
