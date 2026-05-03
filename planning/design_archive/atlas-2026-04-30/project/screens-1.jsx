/* global React, Icon, Eyebrow, Hairline, Button, Input, Badge, Card, OwlGlyph, MMonogram, Toggle, Folio,
   WORKSPACE, TABLES, TEMPLOS_COLUMNS, TEMPLOS_DATA, LINHAGENS, PERSONALIDADES_SAMPLE, MODERATORS, ADMINS, SQL_DRY_RUN, SHEET_HEADERS */

const { useState, useMemo, useEffect, useRef } = React;

// ─────────────────────────────────────────────────────────────────────────────
//  SHELL — sidebar + topbar — present on every screen
// ─────────────────────────────────────────────────────────────────────────────

function Sidebar({ active, onNavigate, persona, terminology, workspace, workspaceId, setWorkspace }) {
  const TERM = terminology === "tabela" ? "Tabelas" : "Coleções";
  const items = [
    { id: "tables",   icon: "table",    label: TERM,         persona: ["admin","master","moderator"] },
    { id: "schema",   icon: "schema",   label: "Schema",       persona: ["admin","master"] },
    { id: "import",   icon: "upload",   label: "Importar",     persona: ["admin","master"] },
    { id: "moderators", icon: "users",  label: "Moderadores",  persona: ["admin","master"] },
    { id: "groups",   icon: "layers",   label: "Grupos",       persona: ["admin","master"] },
    { id: "dashboard", icon: "globe",   label: "Dashboard",    persona: ["admin","master","moderator"] },
    { id: "publish",  icon: "upload",   label: "Publicar site", persona: ["admin","master"] },
    { id: "explore",  icon: "search",   label: "Explore",      persona: ["admin","master","moderator"] },
  ];
  const masterItems = [
    { id: "master",   icon: "shield",   label: "Painel Master" },
    { id: "qr",       icon: "qrcode",   label: "Auth QR" },
  ];

  return (
    <aside style={{
      width: 220, flexShrink: 0, background: "var(--bg-secondary)",
      borderRight: "1px solid var(--rule)", display: "flex", flexDirection: "column",
      padding: "20px 14px", height: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 18px" }}>
        <MMonogram size={28} color="var(--accent-text)" />
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, lineHeight: 1, color: "var(--fg-primary)" }}>Atlas</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)", marginTop: 4 }}>v.4 — outono</div>
        </div>
      </div>

      <div style={{
        padding: "10px 12px", margin: "0 -6px 14px",
        background: "var(--bg-elevated)", border: "1px solid var(--rule-faint)",
        borderRadius: 8, position: "relative",
      }}>
        <Eyebrow style={{ fontSize: 9 }}>Workspace</Eyebrow>
        <button onClick={() => {
          if (!setWorkspace) return;
          const order = ["centrobudista", "igreja", "biblioteca"];
          const i = order.indexOf(workspaceId);
          setWorkspace(order[(i + 1) % order.length]);
        }} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
          background: "transparent", border: 0, padding: 0, cursor: setWorkspace ? "pointer" : "default", textAlign: "left",
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 14, lineHeight: 1.2, color: "var(--fg-primary)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {(workspace || WORKSPACE).name}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)", marginTop: 3, letterSpacing: "0.04em" }}>
              {(workspace || WORKSPACE).slug}.atlas
            </div>
          </div>
          {setWorkspace && <Icon name="cdown" size={12} color="var(--fg-muted)" />}
        </button>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        {items.filter(i => i.persona.includes(persona)).map(it => (
          <NavItem key={it.id} {...it} active={active === it.id} onClick={() => onNavigate(it.id)} />
        ))}

        {persona === "master" && (
          <>
            <div style={{ marginTop: 18, padding: "0 8px 6px" }}>
              <Eyebrow style={{ fontSize: 9 }}>Master</Eyebrow>
            </div>
            {masterItems.map(it => (
              <NavItem key={it.id} {...it} active={active === it.id} onClick={() => onNavigate(it.id)} />
            ))}
          </>
        )}
      </nav>

      <div style={{ marginTop: 18, padding: "12px 8px 0", borderTop: "1px solid var(--rule-faint)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 999,
            background: persona === "master" ? "var(--pigment-ruby)" : persona === "admin" ? "var(--pigment-goldenrod-deep)" : "var(--pigment-sage-deep)",
            color: "var(--pigment-parchment)", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 500, fontStyle: "italic",
          }}>{persona === "master" ? "LO" : persona === "admin" ? "TH" : "AT"}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: "var(--fg-primary)", lineHeight: 1.2, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {persona === "master" ? "Liana Otsuka" : persona === "admin" ? (workspace || WORKSPACE).user.name : (workspace?.id === "biblioteca" ? "Beatriz Carvalho" : workspace?.id === "igreja" ? "Débora Lopes" : "Aiko Tanaka")}
            </div>
            <Badge tone={persona} dot>{persona}</Badge>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px", borderRadius: 6, border: 0,
      background: active ? "var(--accent-soft)" : "transparent",
      color: active ? "var(--accent-text)" : "var(--fg-secondary)",
      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 500 : 400,
      cursor: "pointer", textAlign: "left", letterSpacing: "-0.005em",
      transition: "background var(--duration-fast)",
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--rule-faint)"; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </button>
  );
}

function ScreenHeader({ folio, eyebrow, title, sub, actions }) {
  return (
    <div style={{ padding: "32px 48px 24px", borderBottom: "1px solid var(--rule-faint)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {folio && <div style={{ marginBottom: 14 }}><Folio n={folio.n} label={folio.label} /></div>}
          {eyebrow && <Eyebrow accent style={{ marginBottom: 8 }}>{eyebrow}</Eyebrow>}
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 40,
            lineHeight: 1.05, margin: 0, letterSpacing: "-0.02em", color: "var(--fg-primary)",
            fontVariationSettings: '"opsz" 96',
          }}>{title}</h1>
          {sub && <p style={{
            fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16,
            color: "var(--fg-secondary)", margin: "10px 0 0", maxWidth: 640, lineHeight: 1.4,
          }}>{sub}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 10, flexShrink: 0, marginTop: 4 }}>{actions}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────────────────────────────────────────

function LoginScreen({ onComplete, workspace }) {
  const ws = WORKSPACES?.[workspace] || WORKSPACES?.centrobudista || { user: { name: "Tereza", username: "tereza" }, name: "Centro Budista do Brasil" };
  const [user, setUser] = useState(ws.user?.email?.split("@")[0] || "tereza");
  const [pass, setPass] = useState("••••••••••");
  const [showPass, setShowPass] = useState(false);

  // Re-init when workspace changes
  useEffect(() => {
    setUser(ws.user?.email?.split("@")[0] || "tereza");
  }, [workspace]);

  return (
    <div style={{
      minHeight: "100%", display: "grid", gridTemplateColumns: "1.1fr 0.9fr",
      background: "var(--bg-primary)",
    }}>
      {/* Left: identity */}
      <div style={{
        background: "var(--pigment-ink)", color: "var(--pigment-parchment)",
        padding: "56px 64px", display: "flex", flexDirection: "column", justifyContent: "space-between",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <MMonogram size={42} color="var(--pigment-burnt-nectar)" />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400 }}>Atlas</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.6, marginTop: 2 }}>
              edição outono · v.4
            </div>
          </div>
        </div>

        <div>
          <Eyebrow style={{ color: "var(--pigment-burnt-nectar)" }}>Capítulo · I</Eyebrow>
          <h1 style={{
            fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 56,
            lineHeight: 1.0, fontWeight: 400, letterSpacing: "-0.02em",
            margin: "20px 0 22px", color: "var(--pigment-parchment)",
            fontVariationSettings: '"opsz" 144',
          }}>
            Bancos de dados que se leem<br />
            como uma <span style={{ color: "var(--pigment-burnt-nectar)" }}>revista.</span>
          </h1>
          <p style={{
            fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1.5, fontStyle: "italic",
            color: "rgba(247, 240, 220, 0.7)", maxWidth: 460, margin: 0,
          }}>
            Para curadores que nunca tocaram em SQL e administradores que vivem dentro dele.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.5 }}>
            mora studio · são paulo<br />outono / 2026
          </div>
          <OwlGlyph size={10} opacity={0.35} color="var(--pigment-burnt-nectar)" />
        </div>
      </div>

      {/* Right: form */}
      <div style={{ padding: "56px 64px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ maxWidth: 380, width: "100%" }}>
          <Folio n="01" label="entrada" />
          <h2 style={{
            fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 400,
            margin: "16px 0 8px", letterSpacing: "-0.015em",
          }}>Identifique-se</h2>
          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", color: "var(--fg-secondary)", margin: "0 0 32px" }}>
            Bem-vinda de volta, {(ws.user?.name || "Tereza").split(" ")[0]}.
          </p>

          <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={e => { e.preventDefault(); onComplete(); }}>
            <div>
              <label style={fieldLabel}>Usuário</label>
              <Input value={user} onChange={e => setUser(e.target.value)} icon="user" />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label style={fieldLabel}>Senha</label>
                <a style={{ fontSize: 11, color: "var(--accent-text)", textDecoration: "none" }} href="#">esqueci</a>
              </div>
              <div style={{ position: "relative" }}>
                <Input type={showPass ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)} icon="lock" />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "transparent", border: 0, cursor: "pointer", color: "var(--fg-muted)", display: "flex",
                }}>
                  <Icon name={showPass ? "eyeoff" : "eye"} size={14} />
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" style={{ marginTop: 6, justifyContent: "center" }}>
              Entrar no Atlas
            </Button>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)" }}>ou</span>
            <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Button variant="secondary" icon="qr" style={{ justifyContent: "center" }} onClick={onComplete}>
              Autorizar com QR
            </Button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Button variant="secondary" icon="google" style={{ justifyContent: "center" }} onClick={onComplete}>Google</Button>
              <Button variant="secondary" icon="github" style={{ justifyContent: "center" }} onClick={onComplete}>GitHub</Button>
            </div>
            <Button variant="ghost" icon="email" style={{ justifyContent: "center" }} onClick={onComplete}>
              Receber link mágico por email
            </Button>
          </div>

          <p style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 28, textAlign: "center", lineHeight: 1.6 }}>
            Não tem cadastro? Atlas é por convite. <a href="#" style={{ color: "var(--accent-text)" }}>Pedir acesso ao master.</a>
          </p>
        </div>
      </div>
    </div>
  );
}

const fieldLabel = {
  display: "block", fontFamily: "var(--font-mono)", fontSize: 10,
  letterSpacing: "0.16em", textTransform: "uppercase",
  color: "var(--fg-muted)", marginBottom: 8,
};

// ─────────────────────────────────────────────────────────────────────────────
//  TABLES INDEX — magazine layout
// ─────────────────────────────────────────────────────────────────────────────

function TablesIndex({ onOpen, terminology }) {
  const [view, setView] = useState("magazine"); // magazine | grid
  const groups = useMemo(() => {
    const g = {};
    TABLES.forEach(t => { (g[t.group] = g[t.group] || []).push(t); });
    return g;
  }, []);

  const TERM_PLURAL = terminology === "tabela" ? "Tabelas" : "Coleções";
  const TERM_SINGULAR = terminology === "tabela" ? "tabela" : "coleção";

  return (
    <div>
      <ScreenHeader
        folio={{ n: "02", label: "índice geral" }}
        eyebrow={`${TABLES.length} ${TERM_PLURAL.toLowerCase()} · ${TABLES.reduce((s,t)=>s+t.count,0).toLocaleString("pt-BR")} registros`}
        title={`Índice de ${TERM_PLURAL.toLowerCase()}`}
        sub={`Tudo que vive em ${WORKSPACE.name}, organizado por categoria editorial.`}
        actions={<>
          <div style={{ display: "flex", border: "1px solid var(--rule)", borderRadius: 6, overflow: "hidden" }}>
            <button onClick={() => setView("magazine")} style={viewToggle(view === "magazine")}>
              <Icon name="list" size={14} />
            </button>
            <button onClick={() => setView("grid")} style={viewToggle(view === "grid")}>
              <Icon name="grid" size={14} />
            </button>
          </div>
          <Button icon="plus">Nova {TERM_SINGULAR}</Button>
        </>}
      />

      <div style={{ padding: "32px 48px 64px" }}>
        {Object.entries(groups).map(([group, tables], gi) => (
          <section key={group} style={{ marginBottom: 48 }}>
            <div style={{
              display: "flex", alignItems: "baseline", justifyContent: "space-between",
              marginBottom: 18, paddingBottom: 8, borderBottom: "2px solid var(--fg-primary)",
            }}>
              <h2 style={{
                fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 28,
                fontWeight: 400, margin: 0, letterSpacing: "-0.01em",
              }}>{group}</h2>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                pt. {String(gi + 1).padStart(2, "0")} — {tables.length} {tables.length === 1 ? "item" : "itens"}
              </span>
            </div>

            {view === "magazine" ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {tables.map((t, idx) => <MagazineRow key={t.id} t={t} idx={idx + 1} onOpen={onOpen} terminology={terminology} />)}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {tables.map(t => <TableCard key={t.id} t={t} onOpen={onOpen} terminology={terminology} />)}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

const viewToggle = (active) => ({
  padding: "7px 10px", border: 0, cursor: "pointer", display: "flex", alignItems: "center",
  background: active ? "var(--bg-secondary)" : "var(--bg-elevated)",
  color: active ? "var(--fg-primary)" : "var(--fg-muted)",
});

function MagazineRow({ t, idx, onOpen, terminology }) {
  const accent = t.accentTone === "goldenrod" ? "var(--pigment-goldenrod)" :
                 t.accentTone === "sage" ? "var(--pigment-sage)" : "var(--accent)";
  return (
    <button onClick={() => onOpen(t)} style={{
      display: "grid", gridTemplateColumns: "60px 1fr 200px 140px 24px",
      gap: 24, alignItems: "center", padding: "20px 4px",
      borderBottom: "1px solid var(--rule-faint)", border: "none",
      borderTop: "1px solid var(--rule-faint)", marginTop: -1,
      background: "transparent", cursor: "pointer", textAlign: "left", width: "100%",
      transition: "background var(--duration-fast)",
    }}
    onMouseEnter={e => e.currentTarget.style.background = "var(--bg-secondary)"}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-muted)",
        letterSpacing: "0.04em",
      }}>{String(idx).padStart(2, "0")}.</span>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h3 style={{
            fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 400,
            margin: 0, letterSpacing: "-0.005em", color: "var(--fg-primary)",
          }}>{t.label}</h3>
          {t.isPublic ? <Badge tone="public" dot>público</Badge> : <Badge tone="private" dot>privado</Badge>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>
          <span>{t.name}</span>
          <span>·</span>
          <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 13, color: "var(--fg-secondary)", letterSpacing: 0 }}>
            {t.description}
          </span>
        </div>
      </div>

      <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 13, color: "var(--fg-muted)" }}>
        atualizado {t.updated}
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 28, lineHeight: 1, color: accent,
          fontVariationSettings: '"opsz" 96',
        }}>{t.count.toLocaleString("pt-BR")}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "var(--fg-muted)", textTransform: "uppercase", marginTop: 2 }}>registros</div>
      </div>

      <Icon name="cright" size={16} color="var(--fg-muted)" />
    </button>
  );
}

function TableCard({ t, onOpen }) {
  return (
    <button onClick={() => onOpen(t)} style={{
      background: "var(--bg-elevated)", border: "1px solid var(--rule)",
      borderRadius: 8, padding: 18, cursor: "pointer", textAlign: "left",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow>{t.name}</Eyebrow>
        {t.isPublic ? <Badge tone="public" dot>público</Badge> : <Badge tone="private" dot>privado</Badge>}
      </div>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 400, margin: 0 }}>{t.label}</h3>
      <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 13, color: "var(--fg-secondary)", margin: 0, lineHeight: 1.4 }}>{t.description}</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--fg-primary)" }}>{t.count.toLocaleString("pt-BR")}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)" }}>{t.updated}</span>
      </div>
    </button>
  );
}

Object.assign(window, { Sidebar, ScreenHeader, LoginScreen, TablesIndex });
