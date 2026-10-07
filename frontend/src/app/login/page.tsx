'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeCanvas } from 'qrcode.react'
import { useAuth } from '@/components/AuthContext'
import { Button, Eyebrow, Field, Hairline, Icon, Input, MMonogram, OwlGlyph, Pill, SectionNum } from '@/components/ui'

const MANIFESTO_ITEMS = [
  'mora (lat.) — a pausa necessária para que a profundidade aconteça.',
  'I. A Recusa do Crunch — Não sacrificamos finais de semana para prazos artificiais.',
  'II. O Fim da Microgestão — O código flui da competência, não da pressão.',
  'III. O Aprendizado Contínuo — O que não sai do papel é base; o que sai é semente.',
  'IV. A Autonomia da Intenção — Nascemos de problemas reais que sentimos e queremos resolver.',
  'V. A Engenharia como Escudo — Software que remove o peso da burocracia para que você foque no que importa.',
  'VI. A Estética da Profundidade — Cada linha de código é um ensaio sobre como o software pode ser orgânico.',
  'VII. Open Source e o Legado Compartilhado — Uma vez entregue, uma ideia permanece no mundo.',
  'VIII. A Verdadeira Definição de Descanso — Descansar é fazer algo com intenção.',
  '"Criamos ferramentas de elite para que o mundo pare de gritar e comece a conversar."',
]

const tickerText = MANIFESTO_ITEMS.join('   ·   ')

type Tab = 'password' | 'qr' | 'magic'

// QR, Magic e OAuth ainda não estão no ar: aparecem em vermelho, sem clique.
const UNAVAILABLE_TABS: Tab[] = ['qr', 'magic']
const unavailableStyle: React.CSSProperties = {
  color: 'var(--danger-text)',
  cursor: 'not-allowed',
}

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [qrSession, setQrSession] = useState<{ session_id: string; expires_at: string } | null>(null)
  const { login, createQRSession, checkQRStatus } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const success = await login(username, password)
    setLoading(false)
    if (success) router.push('/admin')
    else setError('Credenciais inválidas. Tente novamente.')
  }

  const startQR = async () => {
    setError('')
    setLoading(true)
    const session = await createQRSession()
    setLoading(false)
    if (session) setQrSession(session)
    else setError('Não foi possível gerar o QR.')
  }

  // Generate session when entering QR tab
  useEffect(() => {
    if (tab === 'qr' && !qrSession) {
      startQR()
    }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (tab === 'qr' && qrSession) {
      interval = setInterval(async () => {
        const status = await checkQRStatus(qrSession.session_id)
        if (status?.is_authorized && status.access_token) {
          localStorage.setItem('token', status.access_token)
          localStorage.setItem('user', JSON.stringify(status.user))
          window.location.href = '/admin'
        }
      }, 2000)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [tab, qrSession, checkQRStatus])

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--bg-page)', color: 'var(--fg-primary)' }}
    >
      {/* Split 50/50 */}
      <div className="flex-1 grid" style={{ gridTemplateColumns: '1.05fr 0.95fr', minHeight: 0 }}>
        {/* LEFT — masthead editorial */}
        <div
          className="paper-texture"
          style={{
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--rule)',
            padding: '64px 64px 48px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 48,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <MMonogram size={32} color="var(--accent-text)" />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 26,
                fontWeight: 500,
                letterSpacing: 'var(--tracking-tight)',
                color: 'var(--fg-primary)',
              }}
            >
              Atlas
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 'var(--tracking-eyebrow)',
                textTransform: 'uppercase',
                color: 'var(--fg-muted)',
              }}
            >
              uma ferramenta mora · v.1
            </span>
          </div>

          <div>
            <Eyebrow accent style={{ marginBottom: 16 }}>
              Fundado em 2025 · Volume 1 · Publicação contínua
            </Eyebrow>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: 'clamp(64px, 9vw, 120px)',
                lineHeight: 0.95,
                letterSpacing: '-0.025em',
                margin: '0 0 24px',
                color: 'var(--fg-primary)',
              }}
            >
              Atlas
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: 20,
                lineHeight: 1.4,
                color: 'var(--fg-secondary)',
                maxWidth: 460,
                margin: '0 0 28px',
              }}
            >
              Bancos de dados que se leem como uma revista — para curadores
              que nunca tocaram em SQL e administradores que vivem nele.
            </p>

            <Hairline strong />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
              {[
                ['I.', 'A recusa do crunch.'],
                ['II.', 'O fim da microgestão.'],
                ['III.', 'A estética da profundidade.'],
              ].map(([n, t]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <SectionNum>{n}</SectionNum>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      fontSize: 14,
                      color: 'var(--fg-secondary)',
                    }}
                  >
                    {t}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 'var(--tracking-eyebrow)',
                textTransform: 'uppercase',
                color: 'var(--fg-muted)',
              }}
            >
              mora studio · ferramenta editorial
            </div>
            <OwlGlyph size={11} opacity={0.5} caption="mora" />
          </div>
        </div>

        {/* RIGHT — form */}
        <div
          style={{
            padding: '64px 64px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: 'var(--bg-page)',
          }}
        >
          <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
            <Eyebrow style={{ marginBottom: 14 }}>01 · Entrada</Eyebrow>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 36,
                fontWeight: 400,
                margin: '0 0 8px',
                letterSpacing: '-0.015em',
              }}
            >
              Identifique-se
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                color: 'var(--fg-secondary)',
                margin: '0 0 32px',
                fontSize: 15,
              }}
            >
              Bem-vinda de volta.
            </p>

            {/* Tabs */}
            <div
              style={{
                display: 'flex',
                gap: 0,
                marginBottom: 24,
                borderBottom: '1px solid var(--rule)',
              }}
            >
              {[
                { id: 'password' as Tab, label: 'Senha' },
                { id: 'qr' as Tab, label: 'QR' },
                { id: 'magic' as Tab, label: 'Magic' },
              ].map(t => {
                const active = tab === t.id
                const unavailable = UNAVAILABLE_TABS.includes(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    disabled={unavailable}
                    title={unavailable ? 'Indisponível por enquanto' : undefined}
                    style={{
                      background: 'transparent',
                      border: 0,
                      padding: '10px 16px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: 'var(--tracking-eyebrow)',
                      textTransform: 'uppercase',
                      color: active ? 'var(--fg-primary)' : 'var(--fg-muted)',
                      borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                      marginBottom: -1,
                      transition: 'color var(--duration-fast) var(--ease-editorial), border-color var(--duration-base) var(--ease-editorial)',
                      ...(unavailable ? unavailableStyle : null),
                    }}
                  >
                    {t.label}
                    {unavailable && (
                      <span style={{ marginLeft: 6, fontSize: 9, letterSpacing: '0.12em', opacity: 0.85 }}>
                        em breve
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {error && (
              <div style={{ marginBottom: 16 }}>
                <Pill tone="err" dot>{error}</Pill>
              </div>
            )}

            {tab === 'password' && (
              <>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Field label="Usuário">
                    <Input value={username} onChange={e => setUsername(e.target.value)} icon="user" placeholder="seu.usuario" />
                  </Field>
                  <Field label="Senha">
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} icon="lock" placeholder="••••••••" />
                  </Field>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    disabled={loading}
                    style={{ marginTop: 8, justifyContent: 'center' }}
                  >
                    {loading ? 'Entrando…' : 'Entrar'}
                  </Button>
                </form>
              </>
            )}

            {tab === 'qr' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                <div
                  style={{
                    padding: 16,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {qrSession ? (
                    <QRCodeCanvas
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/admin/qr-auth?session_id=${qrSession.session_id}`}
                      size={200}
                      level="H"
                      bgColor="#ffffff"
                      fgColor="#0d0d0d"
                    />
                  ) : (
                    <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      gerando…
                    </div>
                  )}
                </div>
                <p style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--fg-secondary)', maxWidth: 280, margin: 0 }}>
                  Abra o Atlas em outro dispositivo logado e autorize esta sessão.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', animation: 'mora-pulse 1.4s ease-in-out infinite' }} />
                  Aguardando autorização
                </div>
                <style>{`
                  @keyframes mora-pulse {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 1; }
                  }
                `}</style>
              </div>
            )}

            {tab === 'magic' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15, color: 'var(--fg-secondary)', margin: 0 }}>
                  Receba um link de acesso por email. Em breve.
                </p>
                <Button variant="secondary" disabled icon="bell" style={{ justifyContent: 'center', width: '100%' }}>
                  Em breve
                </Button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
                ou
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {['Google', 'GitHub'].map(provider => (
                <Button
                  key={provider}
                  variant="secondary"
                  disabled
                  title="Indisponível por enquanto"
                  style={{
                    justifyContent: 'center',
                    opacity: 1,
                    border: '1px solid color-mix(in srgb, var(--danger) 45%, transparent)',
                    background: 'var(--danger-bg)',
                    ...unavailableStyle,
                  }}
                >
                  <Icon name="external-link" size={14} />
                  {provider}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>
                    em breve
                  </span>
                </Button>
              ))}
            </div>

            <p
              style={{
                marginTop: 32,
                textAlign: 'center',
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: 17,
                lineHeight: 1.5,
                color: 'var(--fg-secondary)',
              }}
            >
              O Atlas é por convite. Peça acesso ao master.
            </p>
          </div>
        </div>
      </div>

      {/* Manifesto ticker */}
      <div
        style={{
          width: '100%',
          overflow: 'hidden',
          padding: '12px 0',
          borderTop: '1px solid var(--rule)',
          background: 'var(--bg-surface)',
        }}
      >
        <style>{`
          @keyframes mora-ticker {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .mora-ticker-track {
            display: flex;
            width: max-content;
            animation: mora-ticker 90s linear infinite;
          }
          .mora-ticker-track:hover { animation-play-state: paused; }
        `}</style>
        <div className="mora-ticker-track">
          {[tickerText, tickerText].map((text, i) => (
            <span
              key={i}
              style={{
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.04em',
                color: 'var(--fg-muted)',
                padding: '0 32px',
              }}
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
