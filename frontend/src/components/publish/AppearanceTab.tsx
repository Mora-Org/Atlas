'use client';

import React, { useState } from 'react';
import {
  usePublish,
  PRESETS,
  ACCENT_SWATCHES,
  DISPLAY_FONTS,
  BODY_FONTS,
  Density,
  LayoutType,
  PresetId,
} from '@/contexts/PublishContext';

const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

export function AppearanceTab() {
  const { state, applyPreset, patch } = usePublish();
  const t = state.theme_config;
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="flex flex-col">
      {/* §I — Presets */}
      <Section eyebrow="§ I" title="Começar de um preset">
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(PRESETS) as [Exclude<PresetId, 'custom'>, typeof PRESETS[keyof typeof PRESETS]][]).map(([id, p]) => {
            const active = t.preset === id;
            return (
              <button
                key={id}
                onClick={() => applyPreset(id)}
                className="text-left p-3 rounded transition-colors"
                style={{
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
                  boxShadow: active ? '0 0 0 3px var(--accent-soft)' : 'none',
                }}
              >
                <div className="flex gap-1 mb-2">
                  {[p.config.colors.bg, p.config.colors.surface, p.config.colors.ink, p.config.colors.accent].map((c, i) => (
                    <span key={i} className="w-4 h-4 rounded-sm" style={{ background: c, border: '1px solid rgba(0,0,0,0.08)' }} />
                  ))}
                </div>
                <div
                  style={{
                    fontFamily: p.config.typography.display.family,
                    fontStyle: p.config.typography.display.italic ? 'italic' : 'normal',
                    fontSize: 15,
                    color: 'var(--fg-primary)',
                  }}
                >
                  {p.name}
                </div>
                <div style={{ ...monoLabel, fontSize: 9, marginTop: 2 }}>{p.hint}</div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setShowCustom((v) => !v)}
          className="mt-3 w-full px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors"
          style={{
            border: `1px ${showCustom ? 'solid' : 'dashed'} ${showCustom ? 'var(--accent)' : 'var(--rule)'}`,
            background: showCustom ? 'var(--accent-soft)' : 'transparent',
            color: showCustom ? 'var(--accent-text)' : 'var(--fg-secondary)',
          }}
        >
          <span>{showCustom ? '▾' : '▸'}</span>
          <span>Personalizar</span>
          <span style={{ marginLeft: 'auto', ...monoLabel, fontSize: 9, opacity: 0.7 }}>
            {t.preset === 'custom' ? 'modificado' : 'do preset'}
          </span>
        </button>
      </Section>

      {showCustom && (
        <>
          {/* §II — Cor */}
          <Section eyebrow="§ II" title="Cor">
            <Field label="Acento">
              <div className="flex items-center gap-2 flex-wrap">
                {ACCENT_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => patch('colors.accent', c)}
                    title={c}
                    className="w-7 h-7 rounded-full cursor-pointer transition-transform hover:scale-110"
                    style={{
                      background: c,
                      border: `2px solid ${t.colors.accent === c ? 'var(--fg-primary)' : 'transparent'}`,
                    }}
                  />
                ))}
                <input
                  type="text"
                  value={t.colors.accent}
                  onChange={(e) => patch('colors.accent', e.target.value)}
                  className="px-2 py-1 rounded text-xs font-mono w-24"
                  style={{ background: 'var(--bg-page)', border: '1px solid var(--rule)', color: 'var(--fg-primary)' }}
                />
              </div>
            </Field>

            {(['bg', 'surface', 'ink', 'rule'] as const).map((key) => (
              <Field key={key} label={({ bg: 'Fundo', surface: 'Superfície', ink: 'Texto', rule: 'Linha' } as const)[key]}>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={t.colors[key]}
                    onChange={(e) => patch(`colors.${key}`, e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer"
                    style={{ border: '1px solid var(--rule)' }}
                  />
                  <span className="text-xs font-mono" style={{ color: 'var(--fg-muted)' }}>{t.colors[key]}</span>
                </div>
              </Field>
            ))}
          </Section>

          {/* §III — Tipografia */}
          <Section eyebrow="§ III" title="Tipografia">
            <Field label="Display">
              <div className="grid grid-cols-2 gap-1.5">
                {DISPLAY_FONTS.map((f) => {
                  const active = t.typography.display.family === f.family;
                  return (
                    <button
                      key={f.id}
                      onClick={() => patch('typography.display.family', f.family)}
                      className="text-left p-2 rounded text-sm"
                      style={{
                        background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
                        fontFamily: f.family,
                        fontStyle: f.italic ? 'italic' : 'normal',
                        color: 'var(--fg-primary)',
                      }}
                    >
                      <div style={{ fontSize: 16 }}>Aa</div>
                      <div style={{ ...monoLabel, fontSize: 9, marginTop: 2 }}>{f.label}</div>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Corpo">
              <div className="grid grid-cols-2 gap-1.5">
                {BODY_FONTS.map((f) => {
                  const active = t.typography.body.family === f.family;
                  return (
                    <button
                      key={f.id}
                      onClick={() => patch('typography.body.family', f.family)}
                      className="text-left p-2 rounded text-xs"
                      style={{
                        background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
                        fontFamily: f.family,
                        color: 'var(--fg-primary)',
                      }}
                    >
                      <div style={{ fontSize: 12 }}>O sol nasce</div>
                      <div style={{ ...monoLabel, fontSize: 9, marginTop: 2 }}>{f.label}</div>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={`Tamanho do hero · ${t.typography.display.size}px`}>
              <input
                type="range"
                min={40}
                max={120}
                value={t.typography.display.size}
                onChange={(e) => patch('typography.display.size', parseInt(e.target.value, 10))}
                className="w-full"
              />
            </Field>

            <Toggle
              label="Itálico nos títulos"
              checked={t.typography.display.italic}
              onChange={(v) => patch('typography.display.italic', v)}
            />
          </Section>

          {/* §IV — Layout */}
          <Section eyebrow="§ IV" title="Layout">
            <Field label="Densidade">
              <div className="grid grid-cols-3 gap-1">
                {(['compact', 'regular', 'comfy'] as Density[]).map((d) => {
                  const active = t.layout.density === d;
                  return (
                    <button
                      key={d}
                      onClick={() => patch('layout.density', d)}
                      className="p-2 rounded text-sm transition-colors"
                      style={{
                        background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
                        color: active ? 'var(--accent-text)' : 'var(--fg-primary)',
                        fontFamily: 'var(--font-display)',
                        fontStyle: 'italic',
                      }}
                    >
                      {{ compact: 'Denso', regular: 'Regular', comfy: 'Espaçoso' }[d]}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={`Raio das bordas · ${t.layout.radius}px`}>
              <input
                type="range"
                min={0}
                max={24}
                value={t.layout.radius}
                onChange={(e) => patch('layout.radius', parseInt(e.target.value, 10))}
                className="w-full"
              />
            </Field>

            <Field label="Layout default das tabelas">
              <div className="grid grid-cols-3 gap-1">
                {(['tabela', 'list', 'grid', 'essay'] as LayoutType[]).map((l) => {
                  const active = t.layout.default_table_layout === l;
                  return (
                    <button
                      key={l}
                      onClick={() => patch('layout.default_table_layout', l)}
                      className="p-2 rounded text-sm transition-colors"
                      style={{
                        background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
                        color: active ? 'var(--accent-text)' : 'var(--fg-primary)',
                      }}
                    >
                      {{ tabela: 'Tabela', list: 'Lista', grid: 'Grade', essay: 'Ensaio' }[l]}
                    </button>
                  );
                })}
              </div>
            </Field>
          </Section>

          {/* §V — Copy */}
          <Section eyebrow="§ V" title="Copy do hero">
            <p className="text-xs" style={{ color: 'var(--fg-muted)', lineHeight: 1.5 }}>
              Eyebrow, título e subtítulo se editam clicando direto na preview à direita.
              Os textos são salvos no rascunho ao perder o foco.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}

/* ─────────────────────── pieces ─────────────────────── */

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section
      className="py-5"
      style={{ borderBottom: '1px solid var(--rule-faint)' }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <span style={monoLabel}>
          <span style={{ color: 'var(--accent-text)', marginRight: 8 }}>{eyebrow}</span>
          {title}
        </span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block mb-2" style={monoLabel}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 cursor-pointer py-1 text-sm"
      style={{ color: 'var(--fg-secondary)' }}
    >
      <span
        style={{
          width: 32,
          height: 18,
          borderRadius: 999,
          padding: 2,
          background: checked ? 'var(--accent)' : 'var(--rule)',
          display: 'flex',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          transition: 'background 140ms',
        }}
      >
        <span style={{ width: 14, height: 14, borderRadius: 999, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
      </span>
      {label}
    </button>
  );
}
