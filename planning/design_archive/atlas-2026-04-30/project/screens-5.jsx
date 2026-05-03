/* global React, Icon, Eyebrow, Hairline, Button, Input, Badge, Card, Toggle, Folio, MMonogram,
   ScreenHeader, TEMPLOS_DATA, LINHAGENS, TABLES, WORKSPACE */

const { useState: uS5, useMemo: uM5 } = React;

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC SITE — only accessible AFTER admin publishes
//  Three states:
//    "studio"    — admin editing theme, picking publish vs export
//    "site"      — visitors browsing the published site (Atlas-hosted)
//    "exported"  — admin reviewing the exported packages (front/back/db)
// ─────────────────────────────────────────────────────────────────────────────

const PRESETS = {
  editorial: {
    name: "Editorial",
    fontDisplay: "'Fraunces', Georgia, serif",
    fontBody: "'IBM Plex Serif', Georgia, serif",
    fontMono: "'IBM Plex Mono', monospace",
    bg: "#FAEFD9", surface: "#FFFCF3", ink: "#212842", muted: "#4A5468",
    accent: "#C2441C", rule: "#212842",
    radius: 4, density: "comfy",
    headerSize: 88, italicHeadlines: true,
  },
  modern: {
    name: "Moderno",
    fontDisplay: "'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    bg: "#F5F5F4", surface: "#FFFFFF", ink: "#0A0A0A", muted: "#525252",
    accent: "#0A0A0A", rule: "#E5E5E5",
    radius: 12, density: "regular",
    headerSize: 64, italicHeadlines: false,
  },
  monastic: {
    name: "Monástico",
    fontDisplay: "'EB Garamond', Garamond, serif",
    fontBody: "'EB Garamond', Garamond, serif",
    fontMono: "'IBM Plex Mono', monospace",
    bg: "#F4ECDC", surface: "#FAF4E6", ink: "#2A1F0F", muted: "#5C4A2E",
    accent: "#852E47", rule: "#8B6F3E",
    radius: 0, density: "comfy",
    headerSize: 96, italicHeadlines: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC SITE — what visitors see when admin has published
// ─────────────────────────────────────────────────────────────────────────────

function PublicSite({ theme = PRESETS.editorial, embedded = false, query: extQuery, onQuery, ws }) {
  // ws is { WORKSPACE, PRIMARY_DATA, CATEGORIES, CATEGORY_LABEL_PLURAL, DETAIL_FIELDS, … }
  const wsd = ws || (window.getWorkspaceData ? window.getWorkspaceData(window.WORKSPACE?.id) : null);
  const W = wsd?.WORKSPACE || WORKSPACE;
  const data = wsd?.PRIMARY_DATA || TEMPLOS_DATA;
  const cats = wsd?.CATEGORIES || LINHAGENS;
  const catPlural = wsd?.CATEGORY_LABEL_PLURAL || "linhagens";
  const detailFields = wsd?.DETAIL_FIELDS || [
    ["linhagem", "linhagem"], ["cidade", "cidade"],
    ["fundado em", "fundado_em"], ["abade", "abade"],
    ["aberto ao público", "aberto_publico"], ["registros vinculados", "registros"],
  ];
  const resultLabel = wsd?.LIST_RESULT_LABEL || (r => `${r.linhagem} · ${r.cidade}${r.abade ? ` · abade ${r.abade}` : ""}`);
  const dateLabel   = wsd?.LIST_DATE_LABEL   || (r => `fundado em ${r.fundado_em.slice(0, 4)}`);

  const [internalQuery, setInternalQuery] = uS5("");
  const query = extQuery !== undefined ? extQuery : internalQuery;
  const setQuery = onQuery || setInternalQuery;
  const [filterLin, setFilterLin] = uS5("todas");
  const [selected, setSelected] = uS5(null);

  // Reset selection when workspace changes
  React.useEffect(() => { setSelected(null); setFilterLin("todas"); }, [W.id]);

  const results = uM5(() => data.filter(r => {
    if (query && !(r.nome.toLowerCase().includes(query.toLowerCase()) ||
                   r.cidade.toLowerCase().includes(query.toLowerCase()) ||
                   r.linhagem.toLowerCase().includes(query.toLowerCase()))) return false;
    if (filterLin !== "todas" && r.linhagem !== filterLin) return false;
    return true;
  }), [query, filterLin, data, W.id]);

  const t = theme;
  const root = embedded ? {} : { minHeight: "100vh" };
  const heroPad = t.density === "comfy" ? "72px 56px 56px" : t.density === "regular" ? "56px 56px 40px" : "40px 56px 28px";
  const sectionPad = t.density === "comfy" ? "40px 56px" : t.density === "regular" ? "32px 56px" : "24px 56px";

  return (
    <div style={{ ...root, background: t.bg, color: t.ink, fontFamily: t.fontBody }}>
      <header style={{
        padding: "16px 56px", borderBottom: `1px solid ${t.rule}33`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: embedded ? "static" : "sticky", top: 0, background: t.bg, zIndex: 10,
      }}>
        <span style={{
          fontFamily: t.fontDisplay, fontSize: 22,
          fontStyle: t.italicHeadlines ? "italic" : "normal",
          letterSpacing: "-0.01em", color: t.ink,
        }}>{W.name}</span>
        <nav style={{ display: "flex", gap: 28, fontSize: 13 }}>
          {(W.id === "biblioteca" ? ["Obras", "Autores", "Coleções", "Sobre"]
            : W.id === "igreja"   ? ["Igrejas", "Pastores", "Cultos", "Sobre"]
            :                        ["Templos", "Linhagens", "Eventos", "Sobre"]).map(l => (
            <a key={l} href="#" style={{ color: t.muted, textDecoration: "none" }}>{l}</a>
          ))}
        </nav>
        <div style={{
          fontFamily: t.fontMono, fontSize: 10, letterSpacing: "0.16em",
          textTransform: "uppercase", color: t.muted,
        }}>publicado por atlas</div>
      </header>

      <section style={{ padding: heroPad, borderBottom: `2px solid ${t.ink}` }}>
        <div style={{
          fontFamily: t.fontMono, fontSize: 11, letterSpacing: "0.2em",
          textTransform: "uppercase", color: t.accent, marginBottom: 18,
        }}>{W.publicEyebrow}</div>
        <h1 style={{
          fontFamily: t.fontDisplay, fontSize: t.headerSize, fontWeight: 400,
          fontStyle: t.italicHeadlines ? "italic" : "normal",
          letterSpacing: "-0.025em", margin: 0, lineHeight: 0.95, color: t.ink,
          maxWidth: 900,
        }}>{W.publicTitle}</h1>
        <p style={{
          fontSize: 18, color: t.muted, maxWidth: 580,
          margin: "24px 0 0", lineHeight: 1.5,
        }}>{W.publicSub}</p>
      </section>

      <section style={{
        padding: "24px 56px", borderBottom: `1px solid ${t.rule}22`, background: t.surface,
      }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{
            flex: 1, minWidth: 280, display: "flex", alignItems: "center",
            padding: "12px 16px", background: t.bg,
            border: `1px solid ${t.rule}55`, borderRadius: t.radius,
          }}>
            <Icon name="search" size={16} color={t.muted} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder={W.id === "biblioteca" ? "ex.: Machado de Assis, 1881, Companhia das Letras…"
                : W.id === "igreja" ? "ex.: Pinheiros, Augusto Nicodemus, 1888…"
                : "ex.: Zen, Salvador, Coen Murayama…"}
              style={{
                flex: 1, background: "transparent", border: 0, outline: "none",
                fontFamily: t.fontBody, fontSize: 16, color: t.ink, marginLeft: 12,
              }} />
            {query && <button onClick={() => setQuery("")} style={{
              background: "transparent", border: 0, cursor: "pointer", color: t.muted,
            }}><Icon name="x" size={14} /></button>}
          </div>
          <select value={filterLin} onChange={e => setFilterLin(e.target.value)} style={{
            fontSize: 14, padding: "12px 14px", background: t.bg,
            border: `1px solid ${t.rule}55`, borderRadius: t.radius, color: t.ink,
          }}>
            <option value="todas">{W.id === "biblioteca" ? "Todos os assuntos"
              : W.id === "igreja" ? "Todos os presbitérios"
              : "Todas as linhagens"}</option>
            {cats.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
          <span style={{
            fontFamily: t.fontMono, fontSize: 11, letterSpacing: "0.1em", color: t.muted,
          }}>{results.length} resultado{results.length !== 1 ? "s" : ""}</span>
        </div>
      </section>

      <section style={{ padding: sectionPad }}>
        {results.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <div style={{
              fontFamily: t.fontDisplay,
              fontStyle: t.italicHeadlines ? "italic" : "normal",
              fontSize: 32, color: t.muted, marginBottom: 8,
            }}>Sem resultados.</div>
            <div style={{ fontSize: 14, color: t.muted }}>
              Tente ajustar a busca ou os filtros.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {results.map((r, i) => (
              <article key={r.id} onClick={() => setSelected(r)} style={{
                padding: `${t.density === "comfy" ? "28px" : t.density === "regular" ? "20px" : "14px"} 0`,
                borderTop: i === 0 ? `1px solid ${t.ink}` : `1px solid ${t.rule}22`,
                display: "grid", gridTemplateColumns: "60px 1fr 200px 100px",
                gap: 24, alignItems: "baseline", cursor: "pointer",
              }}>
                <span style={{
                  fontFamily: t.fontDisplay,
                  fontStyle: t.italicHeadlines ? "italic" : "normal",
                  fontSize: 32, color: t.accent, lineHeight: 1,
                }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 style={{
                    fontFamily: t.fontDisplay, fontSize: 26, fontWeight: 400,
                    fontStyle: t.italicHeadlines ? "italic" : "normal",
                    margin: "0 0 6px", lineHeight: 1.15,
                    letterSpacing: "-0.01em", color: t.ink,
                  }}>{r.nome}</h3>
                  <p style={{ fontSize: 14, color: t.muted, margin: 0, lineHeight: 1.4 }}>
                    {resultLabel(r)}
                  </p>
                </div>
                <span style={{
                  fontFamily: t.fontMono, fontSize: 11, color: t.muted, letterSpacing: "0.06em",
                }}>{dateLabel(r)}</span>
                <Icon name="cright" size={14} color={t.muted} />
              </article>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div onClick={() => setSelected(null)} style={{
          position: embedded ? "absolute" : "fixed", inset: 0,
          background: "rgba(0,0,0,0.4)", zIndex: 50,
          display: "flex", justifyContent: "flex-end",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 540, maxWidth: "90%", background: t.bg,
            padding: "32px 40px", overflow: "auto",
            borderLeft: `1px solid ${t.rule}55`,
          }}>
            <button onClick={() => setSelected(null)} style={{
              background: "transparent", border: 0, cursor: "pointer",
              color: t.muted, marginBottom: 20,
              fontFamily: t.fontMono, fontSize: 11, letterSpacing: "0.16em",
              textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6,
            }}><Icon name="x" size={12} /> fechar</button>
            <div style={{
              fontFamily: t.fontMono, fontSize: 11, letterSpacing: "0.18em",
              textTransform: "uppercase", color: t.accent, marginBottom: 12,
            }}>registro · {String(selected.id).padStart(3, "0")}</div>
            <h2 style={{
              fontFamily: t.fontDisplay,
              fontStyle: t.italicHeadlines ? "italic" : "normal",
              fontSize: 44, fontWeight: 400, margin: "0 0 16px",
              lineHeight: 1.05, letterSpacing: "-0.02em",
            }}>{selected.nome}</h2>
            <dl style={{ margin: 0, padding: 0 }}>
              {detailFields.map(([label, key]) => {
                let v = selected[key];
                if (key === "aberto_publico") v = v ? "sim" : "não";
                if (v == null || v === "") v = "—";
                return (
                  <div key={label} style={{
                    display: "grid", gridTemplateColumns: "180px 1fr",
                    padding: "10px 0", borderBottom: `1px dotted ${t.rule}40`,
                  }}>
                    <dt style={{
                      fontFamily: t.fontMono, fontSize: 11, color: t.muted,
                      letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>{label}</dt>
                    <dd style={{ fontSize: 15, color: t.ink, margin: 0 }}>{v}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      )}

      <footer style={{
        padding: "24px 56px", background: t.ink, color: t.bg,
        fontFamily: t.fontMono, fontSize: 10, letterSpacing: "0.18em",
        textTransform: "uppercase", display: "flex", justifyContent: "space-between",
      }}>
        <span>{W.slug}.atlas · CC BY-SA 4.0</span>
        <span>publicado por atlas</span>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  THEME STUDIO + PUBLISH FLOW
// ─────────────────────────────────────────────────────────────────────────────

function ThemeStudio({ ws }) {
  const [theme, setTheme] = uS5(PRESETS.editorial);
  const [tab, setTab] = uS5("type");
  const [step, setStep] = uS5("design"); // design | review-publish | review-export | published | exported
  const update = (patch) => setTheme(t => ({ ...t, ...patch }));

  return (
    <div>
      <ScreenHeader
        folio={{ n: "12", label: "publicação · vitrine pública" }}
        eyebrow="Site público"
        title={
          step === "published" ? "Publicado." :
          step === "exported"  ? "Pacotes prontos." :
                                 "A vitrine do seu acervo"
        }
        sub={
          step === "published" ? `Pesquisadores já podem acessar ${(ws?.WORKSPACE || WORKSPACE).slug}.atlas — qualquer mudança aqui é publicada ao vivo.` :
          step === "exported"  ? "Três pacotes para hospedar onde você quiser. Atlas deixa de ser dependência." :
                                 "Edite à esquerda, veja o resultado à direita. Quando estiver pronto, escolha publicar no Atlas ou exportar pra outro lugar."
        }
        actions={
          step === "design" ? (
            <>
              <PublishedBadge published={false} />
              <Button variant="ghost" onClick={() => setStep("review-export")}>Exportar…</Button>
              <Button icon="globe" onClick={() => setStep("review-publish")}>Publicar no Atlas</Button>
            </>
          ) : step === "published" ? (
            <>
              <PublishedBadge published={true} />
              <Button variant="ghost" icon="copy">Copiar link</Button>
              <Button variant="secondary" onClick={() => setStep("design")}>Editar aparência</Button>
            </>
          ) : step === "exported" ? (
            <>
              <Button variant="ghost" onClick={() => setStep("design")}>Voltar ao studio</Button>
              <Button icon="download">Baixar todos (.zip)</Button>
            </>
          ) : null
        }
      />

      {step === "design" && (
        <StudioBody theme={theme} update={update} setTheme={setTheme} tab={tab} setTab={setTab} ws={ws} />
      )}
      {step === "review-publish" && (
        <PublishReview theme={theme}
          onCancel={() => setStep("design")}
          onConfirm={() => setStep("published")} />
      )}
      {step === "review-export" && (
        <ExportReview theme={theme}
          onCancel={() => setStep("design")}
          onConfirm={() => setStep("exported")} />
      )}
      {step === "published" && (
        <StudioBody theme={theme} update={update} setTheme={setTheme}
          tab={tab} setTab={setTab} bannerLive ws={ws} />
      )}
      {step === "exported" && (
        <ExportedPackages theme={theme} />
      )}
    </div>
  );
}

function PublishedBadge({ published }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999,
      background: published ? "var(--accent-soft)" : "var(--bg-elevated)",
      border: `1px solid ${published ? "var(--accent)" : "var(--rule)"}`,
      fontFamily: "var(--font-mono)", fontSize: 10,
      letterSpacing: "0.16em", textTransform: "uppercase",
      color: published ? "var(--accent-text)" : "var(--fg-muted)",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 999,
        background: published ? "#1FA050" : "var(--fg-muted)",
      }} />
      {published ? "ao vivo" : "rascunho"}
    </span>
  );
}

function StudioBody({ theme, update, setTheme, tab, setTab, bannerLive, ws }) {
  return (
    <>
      {bannerLive && (
        <div style={{
          margin: "0 32px", padding: "10px 16px",
          background: "var(--accent-soft)",
          border: "1px solid var(--accent)", borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "var(--font-mono)", fontSize: 11,
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: "var(--accent-text)",
        }}>
          <span>↗ {(ws?.WORKSPACE || WORKSPACE).slug}.atlas — visível para qualquer pessoa com o link</span>
          <a href="#" style={{ color: "var(--accent-text)", textDecoration: "underline" }}>abrir em nova aba</a>
        </div>
      )}
      <div style={{
        display: "grid", gridTemplateColumns: "380px 1fr",
        height: bannerLive ? "calc(100vh - 280px)" : "calc(100vh - 230px)",
      }}>
        <div style={{
          borderRight: "1px solid var(--rule-faint)",
          background: "var(--bg-secondary)", overflow: "auto",
        }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--rule-faint)" }}>
            <Eyebrow style={{ marginBottom: 10 }}>Começar de um preset</Eyebrow>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {Object.entries(PRESETS).map(([k, p]) => (
                <button key={k} onClick={() => setTheme(p)} style={{
                  padding: "10px 12px", textAlign: "left", cursor: "pointer",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--rule)", borderRadius: 6,
                }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                    {[p.bg, p.ink, p.accent].map((c, i) => (
                      <span key={i} style={{
                        width: 14, height: 14, borderRadius: 3, background: c,
                        border: "1px solid var(--rule-faint)",
                      }} />
                    ))}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-display)", fontSize: 14,
                    color: "var(--fg-primary)", fontStyle: "italic",
                  }}>{p.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{
            display: "flex", borderBottom: "1px solid var(--rule-faint)", padding: "0 24px",
          }}>
            {[
              { id: "type", label: "Tipografia" },
              { id: "color", label: "Cor" },
              { id: "layout", label: "Layout" },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "12px 14px", border: 0, background: "transparent",
                cursor: "pointer",
                borderBottom: `2px solid ${tab === t.id ? "var(--accent)" : "transparent"}`,
                color: tab === t.id ? "var(--fg-primary)" : "var(--fg-muted)",
                fontFamily: "var(--font-mono)", fontSize: 11,
                letterSpacing: "0.14em", textTransform: "uppercase",
              }}>{t.label}</button>
            ))}
          </div>

          <div style={{ padding: 24 }}>
            {tab === "type" && <TypeControls theme={theme} update={update} />}
            {tab === "color" && <ColorControls theme={theme} update={update} />}
            {tab === "layout" && <LayoutControls theme={theme} update={update} />}
          </div>
        </div>

        <div style={{ overflow: "auto", background: "var(--bg-secondary)" }}>
          <div style={{
            padding: "12px 24px", fontFamily: "var(--font-mono)", fontSize: 10,
            letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--fg-muted)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            borderBottom: "1px solid var(--rule-faint)", background: "var(--bg-elevated)",
          }}>
            <span>Pré-visualização ao vivo · {bannerLive ? `${(ws?.WORKSPACE || WORKSPACE).slug}.atlas` : "como pesquisadores verão"}</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Icon name="eye" size={11} /><span>preview</span>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{
              border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden",
              boxShadow: "var(--shadow-raised)", background: theme.bg,
              position: "relative",
            }}>
              <PublicSite theme={theme} embedded ws={ws} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONTROL PANELS
// ─────────────────────────────────────────────────────────────────────────────

const FONT_OPTIONS = {
  display: [
    { id: "fraunces", label: "Fraunces", value: "'Fraunces', Georgia, serif" },
    { id: "garamond", label: "EB Garamond", value: "'EB Garamond', Garamond, serif" },
    { id: "playfair", label: "Playfair Display", value: "'Playfair Display', Georgia, serif" },
    { id: "ibmserif", label: "IBM Plex Serif", value: "'IBM Plex Serif', Georgia, serif" },
    { id: "inter",    label: "Inter", value: "'Inter', system-ui, sans-serif" },
    { id: "manrope",  label: "Manrope", value: "'Manrope', system-ui, sans-serif" },
  ],
  body: [
    { id: "ibmsans",  label: "IBM Plex Sans", value: "'IBM Plex Sans', system-ui, sans-serif" },
    { id: "inter",    label: "Inter", value: "'Inter', system-ui, sans-serif" },
    { id: "ibmserif", label: "IBM Plex Serif", value: "'IBM Plex Serif', Georgia, serif" },
    { id: "garamond", label: "EB Garamond", value: "'EB Garamond', Georgia, serif" },
  ],
};

const PALETTES = [
  { name: "Pergaminho", bg: "#FAEFD9", surface: "#FFFCF3", ink: "#212842", muted: "#4A5468", accent: "#C2441C", rule: "#212842" },
  { name: "Carvão",     bg: "#1A1A1A", surface: "#262626", ink: "#FAFAFA", muted: "#A3A3A3", accent: "#DAA63E", rule: "#FAFAFA" },
  { name: "Marfim",     bg: "#F5F5F4", surface: "#FFFFFF", ink: "#0A0A0A", muted: "#525252", accent: "#852E47", rule: "#E5E5E5" },
  { name: "Sálvia",     bg: "#EFEFE2", surface: "#F8F8EE", ink: "#2D3328", muted: "#5F6E4D", accent: "#5F6E4D", rule: "#5F6E4D" },
];

function TypeControls({ theme, update }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <ControlBlock label="Fonte de títulos">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {FONT_OPTIONS.display.map(f => (
            <button key={f.id} onClick={() => update({ fontDisplay: f.value })} style={{
              padding: "10px 12px", textAlign: "left", cursor: "pointer",
              background: theme.fontDisplay === f.value ? "var(--accent-soft)" : "var(--bg-elevated)",
              border: `1px solid ${theme.fontDisplay === f.value ? "var(--accent)" : "var(--rule)"}`,
              borderRadius: 4,
            }}>
              <div style={{
                fontFamily: f.value, fontSize: 18, color: "var(--fg-primary)", fontStyle: "italic",
              }}>Aa</div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--fg-muted)", marginTop: 4,
              }}>{f.label}</div>
            </button>
          ))}
        </div>
      </ControlBlock>

      <ControlBlock label="Fonte de texto">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {FONT_OPTIONS.body.map(f => (
            <button key={f.id} onClick={() => update({ fontBody: f.value })} style={{
              padding: "10px 12px", textAlign: "left", cursor: "pointer",
              background: theme.fontBody === f.value ? "var(--accent-soft)" : "var(--bg-elevated)",
              border: `1px solid ${theme.fontBody === f.value ? "var(--accent)" : "var(--rule)"}`,
              borderRadius: 4,
            }}>
              <div style={{ fontFamily: f.value, fontSize: 14, color: "var(--fg-primary)" }}>O sol nasce.</div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--fg-muted)", marginTop: 4,
              }}>{f.label}</div>
            </button>
          ))}
        </div>
      </ControlBlock>

      <ControlBlock label={`Tamanho do título · ${theme.headerSize}px`}>
        <input type="range" min="40" max="120" value={theme.headerSize}
          onChange={e => update({ headerSize: +e.target.value })} style={{ width: "100%" }} />
      </ControlBlock>

      <ControlBlock label="Itálico nos títulos">
        <button onClick={() => update({ italicHeadlines: !theme.italicHeadlines })} style={{
          width: "100%", padding: "10px 12px", cursor: "pointer", textAlign: "left",
          background: theme.italicHeadlines ? "var(--accent-soft)" : "var(--bg-elevated)",
          border: `1px solid ${theme.italicHeadlines ? "var(--accent)" : "var(--rule)"}`,
          borderRadius: 4, color: "var(--fg-primary)",
        }}>
          <span style={{
            fontFamily: "var(--font-display)", fontSize: 16,
            fontStyle: theme.italicHeadlines ? "italic" : "normal",
          }}>caráter editorial</span>
          <span style={{
            display: "block", fontFamily: "var(--font-mono)", fontSize: 10,
            color: "var(--fg-muted)", marginTop: 2,
          }}>{theme.italicHeadlines ? "ligado" : "desligado"}</span>
        </button>
      </ControlBlock>
    </div>
  );
}

function ColorControls({ theme, update }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <ControlBlock label="Paletas prontas">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {PALETTES.map(p => (
            <button key={p.name} onClick={() => update(p)} style={{
              padding: 10, cursor: "pointer", textAlign: "left",
              background: "var(--bg-elevated)",
              border: "1px solid var(--rule)", borderRadius: 6,
            }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {[p.bg, p.surface, p.ink, p.muted, p.accent].map((c, i) => (
                  <span key={i} style={{
                    width: 18, height: 18, borderRadius: 3, background: c,
                    border: "1px solid rgba(0,0,0,0.1)",
                  }} />
                ))}
              </div>
              <div style={{
                fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 14,
              }}>{p.name}</div>
            </button>
          ))}
        </div>
      </ControlBlock>

      <ControlBlock label="Cores individuais">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { key: "bg", label: "Fundo" },
            { key: "surface", label: "Superfície" },
            { key: "ink", label: "Texto" },
            { key: "muted", label: "Texto secundário" },
            { key: "accent", label: "Acento" },
            { key: "rule", label: "Linhas" },
          ].map(c => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="color" value={theme[c.key]}
                onChange={e => update({ [c.key]: e.target.value })} style={{
                  width: 32, height: 32, border: "1px solid var(--rule)",
                  borderRadius: 4, cursor: "pointer", padding: 2,
                  background: "var(--bg-elevated)",
                }} />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 13, flex: 1 }}>{c.label}</span>
              <code style={{
                fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)",
              }}>{theme[c.key]}</code>
            </div>
          ))}
        </div>
      </ControlBlock>
    </div>
  );
}

function LayoutControls({ theme, update }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <ControlBlock label="Densidade">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {["compact", "regular", "comfy"].map(d => (
            <button key={d} onClick={() => update({ density: d })} style={{
              padding: "10px 12px", cursor: "pointer",
              background: theme.density === d ? "var(--accent-soft)" : "var(--bg-elevated)",
              border: `1px solid ${theme.density === d ? "var(--accent)" : "var(--rule)"}`,
              borderRadius: 4,
              fontFamily: "var(--font-display)", fontSize: 13,
              fontStyle: "italic", color: "var(--fg-primary)",
            }}>{d === "compact" ? "Denso" : d === "regular" ? "Regular" : "Espaçoso"}</button>
          ))}
        </div>
      </ControlBlock>

      <ControlBlock label={`Raio de borda · ${theme.radius}px`}>
        <input type="range" min="0" max="24" value={theme.radius}
          onChange={e => update({ radius: +e.target.value })} style={{ width: "100%" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <span style={{ width: 40, height: 24, background: theme.accent, borderRadius: theme.radius }} />
          <span style={{ width: 40, height: 24, background: theme.muted, borderRadius: theme.radius }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--fg-muted)", alignSelf: "center",
          }}>{theme.radius === 0 ? "anguloso" : theme.radius < 6 ? "discreto" : theme.radius < 14 ? "suave" : "redondo"}</span>
        </div>
      </ControlBlock>

      <ControlBlock label="O que mostrar">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { l: "Barra de busca em destaque", on: true },
            { l: "Filtros por linhagem", on: true },
            { l: "Mostrar mapa", on: false, hint: "próximo update" },
            { l: "Estatísticas no rodapé", on: true },
          ].map(t => (
            <div key={t.l} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 0", borderBottom: "1px dotted var(--rule-faint)",
            }}>
              <span style={{
                fontFamily: "var(--font-display)", fontSize: 13,
                color: t.on ? "var(--fg-primary)" : "var(--fg-muted)",
              }}>{t.l}{t.hint && <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: "var(--fg-muted)", marginLeft: 8,
              }}>{t.hint}</span>}</span>
              <span style={{
                width: 32, height: 18, borderRadius: 999, padding: 2,
                background: t.on ? "var(--accent)" : "var(--rule)",
                display: "flex", alignItems: "center",
                justifyContent: t.on ? "flex-end" : "flex-start",
              }}>
                <span style={{ width: 14, height: 14, borderRadius: 999, background: "white" }} />
              </span>
            </div>
          ))}
        </div>
      </ControlBlock>
    </div>
  );
}

function ControlBlock({ label, children }) {
  return (
    <div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 10,
        letterSpacing: "0.16em", textTransform: "uppercase",
        color: "var(--fg-muted)", marginBottom: 10,
      }}>{label}</div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLISH REVIEW — confirms before going live on Atlas
// ─────────────────────────────────────────────────────────────────────────────

function PublishReview({ theme, onCancel, onConfirm }) {
  const [subdomain, setSubdomain] = uS5("centrobudista");
  const [includeTables, setIncludeTables] = uS5({
    templos: true, linhagens: true, eventos: true,
    personalidades: true, produtos: false, doacoes: false, clientes: false,
  });

  return (
    <div style={{ padding: "32px 56px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 380px", gap: 40,
        alignItems: "start",
      }}>
        <div>
          <Eyebrow accent>Confirmar publicação</Eyebrow>
          <h2 style={{
            fontFamily: "var(--font-display)", fontStyle: "italic",
            fontSize: 48, fontWeight: 400, margin: "12px 0 24px",
            lineHeight: 1.05, letterSpacing: "-0.02em",
          }}>Onde fica acessível?</h2>

          <div style={{
            border: "1px solid var(--rule)", borderRadius: 8,
            padding: 20, background: "var(--bg-elevated)", marginBottom: 20,
          }}>
            <Eyebrow style={{ marginBottom: 10 }}>endereço</Eyebrow>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <input value={subdomain} onChange={e => setSubdomain(e.target.value)} style={{
                flex: 1, padding: "10px 14px",
                border: "1px solid var(--rule)",
                borderRight: 0, borderRadius: "6px 0 0 6px",
                background: "var(--bg-primary)", color: "var(--fg-primary)",
                fontFamily: "var(--font-mono)", fontSize: 16,
              }} />
              <span style={{
                padding: "10px 14px", border: "1px solid var(--rule)",
                borderRadius: "0 6px 6px 0", background: "var(--bg-secondary)",
                fontFamily: "var(--font-mono)", fontSize: 16,
                color: "var(--fg-muted)",
              }}>.atlas</span>
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10,
              color: "var(--fg-muted)", marginTop: 8,
              letterSpacing: "0.1em", textTransform: "uppercase",
            }}>↳ disponível · também aceitamos domínio próprio em planos pagos</div>
          </div>

          <div style={{
            border: "1px solid var(--rule)", borderRadius: 8,
            padding: 20, background: "var(--bg-elevated)", marginBottom: 20,
          }}>
            <Eyebrow style={{ marginBottom: 12 }}>tabelas que aparecem no site</Eyebrow>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {Object.entries(includeTables).map(([k, on]) => (
                <button key={k}
                  onClick={() => setIncludeTables(s => ({ ...s, [k]: !s[k] }))} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", cursor: "pointer", textAlign: "left",
                    background: on ? "var(--accent-soft)" : "transparent",
                    border: `1px solid ${on ? "var(--accent)" : "var(--rule-faint)"}`,
                    borderRadius: 4,
                  }}>
                  <span style={{
                    fontFamily: "var(--font-display)", fontSize: 15,
                    color: on ? "var(--accent-text)" : "var(--fg-primary)",
                  }}>{k}</span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 10,
                    letterSpacing: "0.14em", textTransform: "uppercase",
                    color: on ? "var(--accent-text)" : "var(--fg-muted)",
                  }}>{on ? "público" : "privado"}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{
            border: "1px solid var(--rule)", borderRadius: 8,
            padding: 20, background: "var(--bg-elevated)",
          }}>
            <Eyebrow style={{ marginBottom: 12 }}>antes de publicar</Eyebrow>
            <ul style={{
              margin: 0, padding: 0, listStyle: "none",
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              {[
                ["check", "Apenas tabelas marcadas como públicas serão expostas"],
                ["check", "Atualizações no banco aparecem no site em tempo real"],
                ["check", "Snapshots de conteúdo são versionados — você pode reverter"],
                ["alert", "Se você apagar uma tabela depois, o site quebra esse caminho"],
              ].map(([icon, text], i) => (
                <li key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  fontFamily: "var(--font-display)", fontSize: 14,
                  color: "var(--fg-secondary)",
                }}>
                  <Icon name={icon} size={14}
                    color={icon === "alert" ? "var(--accent)" : "#1FA050"}
                    style={{ marginTop: 3 }} />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside style={{
          position: "sticky", top: 24,
          border: "1px solid var(--rule)", borderRadius: 8,
          padding: 20, background: "var(--bg-elevated)",
        }}>
          <Eyebrow style={{ marginBottom: 12 }}>resumo</Eyebrow>
          <dl style={{ margin: 0, padding: 0 }}>
            {[
              ["URL", `${subdomain}.atlas`],
              ["Tabelas públicas", `${Object.values(includeTables).filter(Boolean).length} de ${Object.keys(includeTables).length}`],
              ["Registros expostos", "≈ 1.247"],
              ["Tema", "Editorial · Pergaminho"],
              ["Atualização", "Em tempo real"],
              ["Custo", "Incluído no plano"],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 0", borderBottom: "1px dotted var(--rule-faint)",
              }}>
                <dt style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "var(--fg-muted)", letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}>{k}</dt>
                <dd style={{
                  fontFamily: "var(--font-display)", fontSize: 13,
                  color: "var(--fg-primary)", margin: 0, textAlign: "right",
                }}>{v}</dd>
              </div>
            ))}
          </dl>
          <div style={{
            display: "flex", flexDirection: "column", gap: 8, marginTop: 20,
          }}>
            <Button onClick={onConfirm} icon="globe">Publicar agora</Button>
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXPORT REVIEW — admin chooses targets for self-hosting
// ─────────────────────────────────────────────────────────────────────────────

function ExportReview({ theme, onCancel, onConfirm }) {
  const [front, setFront] = uS5("static");   // static | next | nuxt
  const [back, setBack] = uS5("node");       // node | python | go | none
  const [db, setDb] = uS5("postgres");       // postgres | sqlite | mysql | sql

  return (
    <div style={{ padding: "32px 56px", maxWidth: 1180, margin: "0 auto" }}>
      <Eyebrow accent>Hospedar fora do Atlas</Eyebrow>
      <h2 style={{
        fontFamily: "var(--font-display)", fontStyle: "italic",
        fontSize: 48, fontWeight: 400, margin: "12px 0 8px",
        lineHeight: 1.05, letterSpacing: "-0.02em",
      }}>Três pacotes, três pousos.</h2>
      <p style={{
        fontFamily: "var(--font-display)", fontSize: 17,
        color: "var(--fg-secondary)", maxWidth: 640, marginBottom: 32, lineHeight: 1.5,
      }}>
        Atlas gera o front-end (a vitrine que você desenhou ao lado), a API que serve os dados
        e um dump do banco. Cada um pode ir pra um lugar diferente — ou pro mesmo lugar.
      </p>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 32,
      }}>
        <ExportCard
          letter="F" title="Front-end" subtitle="HTML / CSS / JS estático"
          accentColor="var(--pigment-nectar)"
          options={[
            { id: "static", label: "Estático (HTML/CSS/JS)", hint: "Netlify, Vercel, GitHub Pages, S3" },
            { id: "next",   label: "Next.js (React)",        hint: "Vercel, qualquer servidor Node" },
            { id: "nuxt",   label: "Nuxt (Vue)",             hint: "Cloudflare Pages, Netlify" },
          ]}
          selected={front} onChange={setFront}
          contents={[
            "/index.html · vitrine renderizada",
            "/assets · fontes, ícones, css",
            "/_data/*.json · snapshot dos dados",
            "/api/* · stubs de fetch (configuráveis)",
            "README com 3 deploys em 1 clique",
          ]} />

        <ExportCard
          letter="B" title="Back-end" subtitle="API REST + GraphQL"
          accentColor="var(--pigment-goldenrod)"
          options={[
            { id: "node",   label: "Node + Express",  hint: "Railway, Fly.io, Render" },
            { id: "python", label: "Python + FastAPI", hint: "Heroku, Render, AWS Lambda" },
            { id: "go",     label: "Go + chi",         hint: "qualquer container" },
            { id: "none",   label: "Sem back-end",     hint: "site lê direto do snapshot estático" },
          ]}
          selected={back} onChange={setBack}
          contents={[
            "/src · rotas geradas a partir do schema",
            "auth/* · JWT pronto, mesma matriz de permissões",
            "Dockerfile + docker-compose.yml",
            "OpenAPI spec + Postman collection",
            "Migrations idempotentes",
          ]} />

        <ExportCard
          letter="D" title="Banco de dados" subtitle="Schema + dados"
          accentColor="var(--pigment-sage)"
          options={[
            { id: "postgres", label: "PostgreSQL (.sql)",   hint: "Supabase, Neon, RDS, qualquer Postgres" },
            { id: "mysql",    label: "MySQL (.sql)",        hint: "PlanetScale, RDS, MariaDB" },
            { id: "sqlite",   label: "SQLite (.db)",        hint: "1 arquivo — copie pra qualquer lugar" },
            { id: "sql",      label: "Schema apenas (.sql)", hint: "sem dados, só estrutura" },
          ]}
          selected={db} onChange={setDb}
          contents={[
            "schema.sql · CREATE TABLE de todas as tabelas",
            "data.sql · INSERT INTO com todos os registros",
            "indexes.sql · índices e foreign keys",
            "seed.sql · dados iniciais para dev",
            "migration_history · histórico das mudanças",
          ]} />
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "20px 24px", border: "1px solid var(--rule)", borderRadius: 8,
        background: "var(--bg-elevated)",
      }}>
        <div>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: 18, fontStyle: "italic",
          }}>Pacote final · ~2,4 MB</div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)",
            letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4,
          }}>{front} · {back} · {db}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onConfirm} icon="download">Gerar pacotes</Button>
        </div>
      </div>
    </div>
  );
}

function ExportCard({ letter, title, subtitle, accentColor, options, selected, onChange, contents }) {
  return (
    <div style={{
      border: "1px solid var(--rule)", borderRadius: 8,
      background: "var(--bg-elevated)", overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        padding: "20px 20px 16px",
        borderBottom: "1px solid var(--rule-faint)",
        background: `linear-gradient(180deg, ${accentColor}18, transparent)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 4,
            background: accentColor, color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontStyle: "italic",
            fontSize: 22, fontWeight: 500,
          }}>{letter}</span>
          <div>
            <div style={{
              fontFamily: "var(--font-display)", fontStyle: "italic",
              fontSize: 22, fontWeight: 400, lineHeight: 1,
            }}>{title}</div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10,
              color: "var(--fg-muted)", letterSpacing: "0.12em",
              textTransform: "uppercase", marginTop: 4,
            }}>{subtitle}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--rule-faint)" }}>
        <Eyebrow style={{ marginBottom: 10 }}>formato</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {options.map(o => (
            <button key={o.id} onClick={() => onChange(o.id)} style={{
              padding: "10px 12px", cursor: "pointer", textAlign: "left",
              background: selected === o.id ? "var(--accent-soft)" : "transparent",
              border: `1px solid ${selected === o.id ? "var(--accent)" : "var(--rule-faint)"}`,
              borderRadius: 4,
            }}>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 14,
                color: "var(--fg-primary)",
              }}>{o.label}</div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: "var(--fg-muted)", marginTop: 3,
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>↗ {o.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 20px", flex: 1 }}>
        <Eyebrow style={{ marginBottom: 10 }}>contém</Eyebrow>
        <ul style={{
          margin: 0, padding: 0, listStyle: "none",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {contents.map((c, i) => (
            <li key={i} style={{
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: "var(--fg-secondary)", lineHeight: 1.4,
              display: "flex", gap: 8,
            }}>
              <span style={{ color: accentColor }}>›</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXPORTED PACKAGES — review & download screen
// ─────────────────────────────────────────────────────────────────────────────

function ExportedPackages({ theme }) {
  const packages = [
    {
      letter: "F", name: "frontend.zip", size: "1.2 MB",
      flavor: "Next.js · React 18", color: "var(--pigment-nectar)",
      files: ["package.json", "next.config.js", "pages/index.tsx", "pages/[table]/[id].tsx", "components/SearchBar.tsx", "styles/theme.css", "public/assets/", "README.md"],
      deploy: ["vercel deploy", "netlify deploy --prod", "docker build && push"],
    },
    {
      letter: "B", name: "backend.zip", size: "840 KB",
      flavor: "Node + Express", color: "var(--pigment-goldenrod)",
      files: ["package.json", "src/index.ts", "src/routes/*.ts", "src/auth/jwt.ts", "src/db/client.ts", "Dockerfile", "docker-compose.yml", "openapi.yaml", ".env.example"],
      deploy: ["railway up", "fly deploy", "docker compose up"],
    },
    {
      letter: "D", name: "database.sql", size: "412 KB",
      flavor: "PostgreSQL 16", color: "var(--pigment-sage)",
      files: ["01_schema.sql · CREATE TABLE × 9", "02_indexes.sql · 14 índices, 6 FKs", "03_data.sql · 2.337 INSERTs", "04_views.sql · 3 views públicas", "05_policies.sql · row-level security"],
      deploy: ["psql < database.sql", "supabase db push", "pg_restore"],
    },
  ];

  return (
    <div style={{ padding: "32px 56px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{
        padding: "20px 24px", marginBottom: 24,
        background: "var(--accent-soft)", border: "1px solid var(--accent)",
        borderRadius: 8, display: "flex", alignItems: "center", gap: 16,
      }}>
        <Icon name="ok" size={20} color="var(--accent-text)" />
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: 18,
            fontStyle: "italic", color: "var(--accent-text)",
          }}>Pacotes gerados em 8 segundos.</div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--accent-text)", letterSpacing: "0.1em",
            textTransform: "uppercase", marginTop: 4, opacity: 0.8,
          }}>checksums verificados · sha-256 disponível em cada arquivo</div>
        </div>
        <Button icon="download">Baixar tudo (.zip)</Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {packages.map(p => (
          <div key={p.name} style={{
            border: "1px solid var(--rule)", borderRadius: 8,
            background: "var(--bg-elevated)", overflow: "hidden",
            display: "grid", gridTemplateColumns: "200px 1fr 1fr 200px",
          }}>
            <div style={{
              padding: 24, borderRight: "1px solid var(--rule-faint)",
              background: `linear-gradient(180deg, ${p.color}18, transparent)`,
              display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start",
            }}>
              <span style={{
                width: 48, height: 48, borderRadius: 4, background: p.color, color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontStyle: "italic",
                fontSize: 28, fontWeight: 500, marginBottom: 12,
              }}>{p.letter}</span>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 14,
                color: "var(--fg-primary)", marginBottom: 4,
              }}>{p.name}</div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--fg-muted)", letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}>{p.size} · {p.flavor}</div>
            </div>

            <div style={{ padding: "20px 24px", borderRight: "1px solid var(--rule-faint)" }}>
              <Eyebrow style={{ marginBottom: 10 }}>arquivos</Eyebrow>
              <ul style={{
                margin: 0, padding: 0, listStyle: "none",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                {p.files.map(f => (
                  <li key={f} style={{
                    fontFamily: "var(--font-mono)", fontSize: 11,
                    color: "var(--fg-secondary)",
                  }}>{f}</li>
                ))}
              </ul>
            </div>

            <div style={{ padding: "20px 24px", borderRight: "1px solid var(--rule-faint)" }}>
              <Eyebrow style={{ marginBottom: 10 }}>como instalar</Eyebrow>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {p.deploy.map(d => (
                  <code key={d} style={{
                    fontFamily: "var(--font-mono)", fontSize: 11,
                    color: "var(--fg-primary)",
                    background: "var(--bg-secondary)",
                    padding: "6px 10px", borderRadius: 4,
                    border: "1px solid var(--rule-faint)",
                  }}>$ {d}</code>
                ))}
              </div>
            </div>

            <div style={{
              padding: "20px 24px", display: "flex",
              flexDirection: "column", gap: 8, justifyContent: "center",
            }}>
              <Button variant="secondary" icon="download">Baixar</Button>
              <Button variant="ghost" icon="copy">Copiar URL</Button>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 32, padding: "20px 24px",
        border: "1px dashed var(--rule)", borderRadius: 8,
      }}>
        <Eyebrow style={{ marginBottom: 10 }}>e depois?</Eyebrow>
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 16,
          color: "var(--fg-secondary)", lineHeight: 1.5, maxWidth: 720,
        }}>
          Atlas pode continuar rodando como seu painel administrativo enquanto o site público
          vive em outro lugar — ou você pode desligar o Atlas e ficar só com os pacotes.
          Quem está hospedando é problema seu agora.
          <span style={{ fontStyle: "italic", color: "var(--accent)" }}> A liberdade tem esse preço.</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PublicSite, ThemeStudio, PRESETS });
