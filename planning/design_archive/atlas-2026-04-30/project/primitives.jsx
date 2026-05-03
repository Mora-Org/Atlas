/* global React */
// Atlas — Primitives. Tokens via tokens.css.

const ICON_PATHS = {
  database: 'M4 6c0-1.66 3.58-3 8-3s8 1.34 8 3v12c0 1.66-3.58 3-8 3s-8-1.34-8-3V6zM4 6c0 1.66 3.58 3 8 3s8-1.34 8-3M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3',
  lock: 'M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h2v2h-2zM18 14h3M14 18h2v3M18 16v5',
  layout: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  shield: 'M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plus: 'M12 5v14M5 12h14',
  cright: 'M9 6l6 6-6 6',
  cleft: 'M15 6l-6 6 6 6',
  cdown: 'M6 9l6 6 6-6',
  cup: 'M18 15l-6-6-6 6',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M17.94 17.94A10 10 0 0 1 12 19c-7 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10 10 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M2 2l20 20',
  pencil: 'M17 3l4 4-12 12-5 1 1-5L17 3z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  spread: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M8 13h8M8 17h8M8 9h2',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  aleft: 'M19 12H5M12 19l-7-7 7-7',
  aright: 'M5 12h14M12 5l7 7-7 7',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  x: 'M18 6L6 18M6 6l12 12',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  check: 'M20 6L9 17l-5-5',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  schema: 'M5 3h6v6H5zM13 3h6v6h-6zM5 15h6v6H5zM13 15h6v6h-6zM8 9v6M16 9v6',
  google: 'M21.35 11.1H12v3.2h5.35c-.23 1.4-1.7 4.1-5.35 4.1a5.9 5.9 0 1 1 0-11.8c1.85 0 3.1.8 3.8 1.5l2.6-2.5C16.6 4.1 14.5 3 12 3a9 9 0 1 0 0 18c5.2 0 8.65-3.65 8.65-8.8 0-.6-.07-1.05-.15-1.5z',
  github: 'M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z',
  email: 'M22 6l-10 7L2 6M2 6h20v12H2z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  alert: 'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  ok: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  block: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.93 4.93l14.14 14.14',
  drag: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  qrcode: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h2v2h-2zM18 14h3M14 18h2v3M18 16v5',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  calendar: 'M3 4h18v18H3zM3 10h18M8 2v4M16 2v4',
  hash: 'M4 9h16M4 15h16M10 3l-2 18M16 3l-2 18',
  bool: 'M8 6h8a6 6 0 0 1 0 12H8A6 6 0 0 1 8 6zM8 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  text: 'M4 7V5h16v2M9 5v14M15 14h-6',
  json: 'M6 3a3 3 0 0 0-3 3v3a3 3 0 0 1-3 3 3 3 0 0 1 3 3v3a3 3 0 0 0 3 3M18 3a3 3 0 0 1 3 3v3a3 3 0 0 0 3 3 3 3 0 0 0-3 3v3a3 3 0 0 1-3 3',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h2v2h-2',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  building: 'M3 22h18M5 22V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v18M9 6h.01M9 10h.01M9 14h.01M15 6h.01M15 10h.01M15 14h.01',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.61-4.32 1-6 .69 4.31 4 7 4 11a4 4 0 1 1-8 0c0-1 0-1.5.5-2.5z',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.3c1 3.4 0 7-1.5 9.5-1.5 2.4-3.4 4.2-5.7 5.2A7 7 0 0 1 11 20zM2 22l8-8',
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  layers: 'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
};

function Icon({ name, size = 16, color = "currentColor", style, sw = 1.5 }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
      {d.split('M').filter(Boolean).map((p, i) => <path key={i} d={`M${p}`} />)}
    </svg>
  );
}

function Eyebrow({ children, num, accent, style }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
      letterSpacing: "0.18em", textTransform: "uppercase",
      color: accent ? "var(--accent-text)" : "var(--fg-muted)",
      display: "inline-flex", alignItems: "baseline", gap: 8, ...style,
    }}>
      {num && <span style={{ color: "var(--accent-text)" }}>{num}</span>}
      {children}
    </span>
  );
}

function Hairline({ strong, my = 16, style }) {
  return <hr style={{ border: 0, borderTop: `1px solid ${strong ? "var(--rule)" : "var(--rule-faint)"}`, margin: `${my}px 0`, ...style }} />;
}

function Button({ children, variant = "primary", size = "md", icon, iconRight, onClick, disabled, type, style, title }) {
  const sizes = {
    sm: { padding: "6px 10px", fontSize: 12 },
    md: { padding: "8px 14px", fontSize: 13 },
    lg: { padding: "11px 18px", fontSize: 14 },
  };
  const variants = {
    primary:   { background: "var(--accent)", color: "var(--fg-inverse)", border: "1px solid transparent" },
    secondary: { background: "var(--bg-elevated)", color: "var(--fg-primary)", border: "1px solid var(--rule)" },
    ghost:     { background: "transparent", color: "var(--fg-secondary)", border: "1px solid transparent" },
    danger:    { background: "var(--pigment-ruby)", color: "var(--pigment-parchment)", border: "1px solid transparent" },
    link:      { background: "transparent", color: "var(--accent-text)", border: 0, padding: 0, textDecoration: "underline", textUnderlineOffset: 3 },
  };
  return (
    <button type={type || "button"} disabled={disabled} onClick={onClick} title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        borderRadius: 6, fontFamily: "var(--font-sans)", fontWeight: 500,
        lineHeight: 1, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, letterSpacing: "-0.005em",
        transition: "transform var(--duration-fast), background-color var(--duration-fast)",
        ...sizes[size], ...variants[variant], ...style,
      }}
      onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
      onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
      onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
      {icon && <Icon name={icon} size={14} />}
      {children}
      {iconRight && <Icon name={iconRight} size={14} />}
    </button>
  );
}

function Input({ value, onChange, placeholder, type = "text", icon, focused, error, style, mono }) {
  const [isFocus, setFocus] = React.useState(focused || false);
  const showFocus = focused === undefined ? isFocus : focused;
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {icon && (<span style={{ position: "absolute", left: 12, color: "var(--fg-muted)", display: "flex" }}>
        <Icon name={icon} size={14} />
      </span>)}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: "100%", fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          fontSize: 14, padding: icon ? "9px 12px 9px 34px" : "9px 12px",
          borderRadius: 6, background: "var(--bg-elevated)",
          border: `1px solid ${error ? "var(--pigment-ruby)" : showFocus ? "var(--accent)" : "var(--rule)"}`,
          color: "var(--fg-primary)", outline: "none",
          boxShadow: showFocus ? "0 0 0 3px var(--accent-soft)" : "none",
          transition: "border-color var(--duration-fast), box-shadow var(--duration-fast)",
          ...style,
        }} />
    </div>
  );
}

function Badge({ children, tone = "neutral", dot, style }) {
  const tones = {
    neutral:   { bg: "color-mix(in oklab, var(--fg-primary) 8%, transparent)", fg: "var(--fg-secondary)", dotColor: "var(--fg-muted)" },
    master:    { bg: "color-mix(in oklab, var(--pigment-ruby) 14%, transparent)", fg: "var(--pigment-ruby)", dotColor: "var(--pigment-ruby)" },
    admin:     { bg: "color-mix(in oklab, var(--pigment-goldenrod) 18%, transparent)", fg: "var(--pigment-goldenrod-deep)", dotColor: "var(--pigment-goldenrod)" },
    moderator: { bg: "color-mix(in oklab, var(--pigment-sage) 20%, transparent)", fg: "var(--pigment-sage-deep)", dotColor: "var(--pigment-sage)" },
    public:    { bg: "color-mix(in oklab, var(--pigment-sage) 20%, transparent)", fg: "var(--pigment-sage-deep)", dotColor: "var(--pigment-sage-deep)" },
    private:   { bg: "color-mix(in oklab, var(--fg-primary) 8%, transparent)", fg: "var(--fg-secondary)", dotColor: "var(--fg-muted)" },
    fk:        { bg: "color-mix(in oklab, var(--pigment-goldenrod) 22%, transparent)", fg: "var(--pigment-goldenrod-deep)", dotColor: "var(--pigment-goldenrod)" },
    accent:    { bg: "var(--accent-soft)", fg: "var(--accent-text)", dotColor: "var(--accent)" },
    danger:    { bg: "color-mix(in oklab, var(--pigment-ruby) 14%, transparent)", fg: "var(--pigment-ruby)", dotColor: "var(--pigment-ruby)" },
    ok:        { bg: "color-mix(in oklab, var(--pigment-sage) 22%, transparent)", fg: "var(--pigment-sage-deep)", dotColor: "var(--pigment-sage-deep)" },
    warn:      { bg: "color-mix(in oklab, var(--pigment-goldenrod) 18%, transparent)", fg: "var(--pigment-goldenrod-deep)", dotColor: "var(--pigment-goldenrod)" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 9px", fontFamily: "var(--font-mono)", fontSize: 10,
      letterSpacing: "0.14em", textTransform: "uppercase",
      borderRadius: 3, lineHeight: 1.4, background: t.bg, color: t.fg, ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: t.dotColor }} />}
      {children}
    </span>
  );
}

function Card({ children, style, padded = true, raised = false }) {
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--rule)",
      borderRadius: 10, boxShadow: raised ? "var(--shadow-raised)" : "var(--shadow-card)",
      padding: padded ? 18 : 0, ...style,
    }}>{children}</div>
  );
}

// ASCII owl watermark
function OwlGlyph({ size = 11, opacity = 0.5, color = "var(--fg-faint)" }) {
  return (
    <pre style={{
      fontFamily: "var(--font-mono)", fontSize: size, lineHeight: 1.3,
      color, opacity, margin: 0, whiteSpace: "pre",
      userSelect: "none", pointerEvents: "none",
    }}>{` /\\___/\\
( o v o )
 (     )
 _)   (_
  \\   /
   "-"`}</pre>
  );
}

function MMonogram({ size = 24, color = "var(--fg-primary)" }) {
  return (
    <span style={{
      fontFamily: "var(--font-display)", fontStyle: "italic",
      fontSize: size, lineHeight: 1,
      fontVariationSettings: '"opsz" 144, "SOFT" 100, "wght" 400',
      color,
    }}>M</span>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "var(--fg-secondary)" }}
      onClick={onChange}>
      <span style={{
        width: 32, height: 18, borderRadius: 999,
        background: checked ? "var(--accent)" : "var(--rule)",
        position: "relative", transition: "background var(--duration-fast)", flexShrink: 0,
      }}>
        <span style={{
          position: "absolute", top: 2, left: checked ? 16 : 2, width: 14, height: 14,
          borderRadius: 999, background: "var(--bg-elevated)",
          transition: "left var(--duration-fast) var(--ease-editorial)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }} />
      </span>
      <span>
        {label}
        {hint && <span style={{ marginLeft: 8, color: "var(--fg-muted)", fontSize: 11 }}>{hint}</span>}
      </span>
    </label>
  );
}

// folio number — for screen breadcrumbs etc
function Folio({ n, label }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", color: "var(--fg-muted)", textTransform: "uppercase" }}>
      fol. {n} · {label}
    </span>
  );
}

Object.assign(window, { Icon, Eyebrow, Hairline, Button, Input, Badge, Card, OwlGlyph, MMonogram, Toggle, Folio });
