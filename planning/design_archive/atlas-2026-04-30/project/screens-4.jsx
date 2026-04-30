/* global React, Icon, Eyebrow, Hairline, Button, Input, Badge, Card, Toggle, Folio, OwlGlyph, MMonogram,
   ScreenHeader, ADMINS, TABLES, MODERATORS, WORKSPACE, TEMPLOS_DATA, LINHAGENS */

const { useState: uS4, useMemo: uM4 } = React;

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC DASHBOARD — magazine cover-style mural
// ─────────────────────────────────────────────────────────────────────────────

function PublicDashboard({ ws }) {
  const wsd = ws || (window.getWorkspaceData ? window.getWorkspaceData(window.WORKSPACE?.id) : null);
  const W = wsd?.WORKSPACE || WORKSPACE;
  const data = wsd?.PRIMARY_DATA || TEMPLOS_DATA;
  const cats = wsd?.CATEGORIES || LINHAGENS;
  // Per-workspace copy
  const CFGS = {
    biblioteca: {
      folioLabel:    `publicação · ${W.slug}.atlas`,
      eyebrow:       "Catálogo público",
      sectionI:      "I · Obras em destaque",
      sectionII:     "II · Assuntos",
      sectionIII:    "III · Próximas exposições",
      listTagline:   `Ver todas as ${W.publicEyebrow.match(/[\d.]+/)?.[0] || "84.231"} obras →`,
      title1:        "Biblioteca",
      title2:        "Padre Anchieta.",
      masthead:      `${W.edition} · USP`,
      subdomain:     `${W.slug}.atlas / catálogo vigente`,
      blurb:         "Acervo público da Biblioteca Padre Anchieta da Universidade de São Paulo, fundada em 1934 — livros, periódicos, teses e manuscritos.",
      rowMeta: (t)  => <>{t.linhagem} · {t.cidade.split(" · ")[1] || t.cidade.split(",")[0]} · publicado em {t.fundado_em.slice(0,4)}{t.abade && <> · por <span style={{ fontStyle: "italic" }}>{t.abade}</span></>}</>,
      stats: [
        ["84.231", "obras catalogadas"],
        ["23.847", "autores indexados"],
        ["12.492", "teses & dissertações"],
        ["1.284",  "periódicos correntes"],
      ],
      catCount: (l) => data.filter(t => t.linhagem === l.name).length,
      events: [
        { date: "08 MAI", title: "Modernismo, 100 anos",  where: "Sala de exposições · térreo",   days: "até 31 jul" },
        { date: "22 MAI", title: "Manuscritos de Mário",  where: "Coleção especial · 3º andar",   days: "vitrine permanente" },
        { date: "12 JUN", title: "Carolina Maria de Jesus", where: "Auditório Anchieta",           days: "2 dias · simpósio" },
      ],
      eventsLabel: "MAI–JUL 2026",
    },
    igreja: {
      folioLabel:    `boletim · ${W.slug}.atlas`,
      eyebrow:       "Boletim público",
      sectionI:      "I · Igrejas em destaque",
      sectionII:     "II · Presbitérios",
      sectionIII:    "III · Cultos & estudos",
      listTagline:   "Ver todas as 38 igrejas →",
      title1:        "Igreja Presbiteriana",
      title2:        "de São Paulo.",
      masthead:      `${W.edition} · ano LVII`,
      subdomain:     `${W.slug}.atlas / boletim vigente`,
      blurb:         "Federação de igrejas presbiterianas filiadas, fundada em São Paulo em 1888 — congregações, pastores, agenda de cultos, estudos e ministérios.",
      rowMeta: (t)  => <>{t.linhagem} · {t.cidade.split(",")[0]} · fundada em {t.fundado_em.slice(0,4)}{t.abade && <> · pastor <span style={{ fontStyle: "italic" }}>{t.abade}</span></>}</>,
      stats: [
        ["38",    "igrejas · 12 cidades"],
        ["4",     "presbitérios filiados"],
        ["4.283", "membros comungantes"],
        ["412",   "cultos no trimestre"],
      ],
      catCount: (l) => data.filter(t => t.linhagem === l.name).length,
      events: [
        { date: "04 MAI", title: "Culto de Páscoa",          where: "Catedral · Sé",                days: "domingo · 10h" },
        { date: "11 MAI", title: "Estudo de Romanos",        where: "Pinheiros · Capela",           days: "8 quartas" },
        { date: "23 MAI", title: "Conferência Missionária",  where: "Mooca · Salão Calvino",        days: "3 dias · sínodo" },
      ],
      eventsLabel: "MAI–JUL 2026",
    },
    centrobudista: {
      folioLabel:    `publicação · ${W.slug}.atlas`,
      eyebrow:       "Dashboard público",
      sectionI:      "I · Templos em destaque",
      sectionII:     "II · Linhagens",
      sectionIII:    "III · Próximos retiros",
      listTagline:   "Ver todos os 47 templos →",
      title1:        "Centro Budista",
      title2:        "do Brasil.",
      masthead:      `${W.edition} · número 04`,
      subdomain:     `${W.slug}.atlas / edição vigente`,
      blurb:         "Federação não-confessional de templos, mosteiros e associações de prática budista, fundada em São Paulo em 2018.",
      rowMeta: (t)  => <>{t.linhagem} · {t.cidade} · fundado em {t.fundado_em.slice(0,4)}{t.abade && <> · abade <span style={{ fontStyle: "italic" }}>{t.abade}</span></>}</>,
      stats: [
        ["47", "templos · 18 cidades"],
        ["6",  "linhagens representadas"],
        ["312","personalidades catalogadas"],
        ["89", "eventos no calendário"],
      ],
      catCount: (l) => data.filter(t => t.linhagem === l.name).length,
      events: [
        { date: "12 OUT", title: "Sesshin de outono", where: "Pico de Raios · ES", days: "5 dias" },
        { date: "07 NOV", title: "Retiro de silêncio", where: "Khadro Ling · RS", days: "10 dias" },
        { date: "21 DEZ", title: "Vigília de Rōhatsu", where: "Busshinji · SP",   days: "1 noite" },
      ],
      eventsLabel: "OUT–DEZ 2026",
    },
  };
  const cfg = CFGS[W.id] || CFGS.centrobudista;

  return (
    <div style={{ background: "var(--bg-primary)" }}>
      <ScreenHeader
        folio={{ n: "07", label: cfg.folioLabel }}
        eyebrow={cfg.eyebrow}
        title="A capa que o mundo vê"
        sub={`Arraste blocos pra reorganizar. Quem visitar /${W.slug} vê exatamente isto — em modo só-leitura.`}
        actions={<>
          <Button variant="ghost" icon="eye">Pré-visualizar</Button>
          <Button variant="secondary" icon="copy">Copiar link</Button>
          <Button icon="globe">Publicar</Button>
        </>}
      />

      {/* The published cover */}
      <div style={{
        margin: "32px 48px 64px", background: "var(--pigment-parchment)",
        border: "1px solid var(--rule)", borderRadius: 12, overflow: "hidden",
        boxShadow: "var(--shadow-raised)",
      }}>
        {/* Masthead */}
        <div style={{ padding: "44px 56px 32px", borderBottom: "2px solid var(--pigment-ink)", position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
            <Eyebrow accent>{cfg.masthead}</Eyebrow>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              {cfg.subdomain}
            </span>
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400,
            fontSize: 88, lineHeight: 0.95, margin: 0, letterSpacing: "-0.025em",
            color: "var(--pigment-ink)", fontVariationSettings: '"opsz" 144',
          }}>
            {cfg.title1}<br />
            <span style={{ color: "var(--accent-text)" }}>{cfg.title2}</span>
          </h1>
          <p style={{
            fontFamily: "var(--font-display)", fontSize: 18, color: "var(--fg-secondary)",
            maxWidth: 560, marginTop: 24, marginBottom: 0, lineHeight: 1.45,
          }}>
            {cfg.blurb}
          </p>
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 0 }}>
          <div style={{ padding: "32px 56px", borderRight: "1px solid var(--rule-faint)" }}>
            <Eyebrow style={{ marginBottom: 14 }}>{cfg.sectionI}</Eyebrow>

            {data.slice(0, 4).map((t, i) => (
              <article key={t.id} style={{
                padding: "20px 0", borderTop: i === 0 ? "1px solid var(--pigment-ink)" : "1px solid var(--rule-faint)",
                display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 20, alignItems: "baseline",
              }}>
                <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 36, color: "var(--accent-text)", fontVariationSettings: '"opsz" 96' }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 26, fontWeight: 400, margin: "0 0 4px", lineHeight: 1.1, letterSpacing: "-0.01em" }}>{t.nome}</h3>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--fg-secondary)", margin: 0, lineHeight: 1.4 }}>
                    {cfg.rowMeta(t)}
                  </p>
                </div>
                <Icon name="cright" size={14} color="var(--fg-muted)" />
              </article>
            ))}

            <div style={{ marginTop: 24 }}>
              <a style={{ color: "var(--accent-text)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", textDecoration: "none" }}>
                {cfg.listTagline}
              </a>
            </div>
          </div>

          <aside style={{ padding: "32px", display: "flex", flexDirection: "column", gap: 24, background: "color-mix(in oklab, var(--pigment-parchment) 60%, var(--bg-secondary))" }}>
            <div>
              <Eyebrow style={{ marginBottom: 12 }}>Em números</Eyebrow>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {cfg.stats.map(([n, label], i) => <Stat key={i} n={n} label={label} />)}
              </div>
            </div>

            <Hairline strong my={0} />

            <div>
              <Eyebrow style={{ marginBottom: 12 }}>{cfg.sectionII}</Eyebrow>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {cats.map((l, i) => (
                  <div key={l.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "baseline",
                    padding: "8px 0", borderBottom: i < cats.length - 1 ? "1px dotted var(--rule)" : "none",
                  }}>
                    <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16, color: "var(--fg-primary)" }}>{l.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>
                      {cfg.catCount(l)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {/* Events strip */}
        <div style={{ padding: "32px 56px", borderTop: "2px solid var(--pigment-ink)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
            <Eyebrow>{cfg.sectionIII}</Eyebrow>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)", letterSpacing: "0.16em" }}>{cfg.eventsLabel}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {cfg.events.map((e, i) => (
              <div key={i} style={{ borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-text)", letterSpacing: "0.18em", marginBottom: 8 }}>{e.date} · {e.days}</div>
                <h4 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 22, fontWeight: 400, margin: "0 0 4px", lineHeight: 1.15 }}>{e.title}</h4>
                <p style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--fg-secondary)", margin: 0 }}>{e.where}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Colofão */}
        <div style={{ padding: "20px 56px", background: "var(--pigment-ink)", color: "var(--pigment-parchment)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7 }}>
            publicado por atlas · {W.name} · CC BY-SA 4.0
          </div>
          <MMonogram size={20} color="var(--pigment-burnt-nectar)" />
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
      <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 38, color: "var(--accent-text)", lineHeight: 1, fontVariationSettings: '"opsz" 144' }}>{n}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--fg-secondary)" }}>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXPLORE
// ─────────────────────────────────────────────────────────────────────────────

function ExploreScreen() {
  const [q, setQ] = uS4("");
  return (
    <div>
      <ScreenHeader
        folio={{ n: "08", label: "busca pública" }}
        eyebrow="Explore"
        title="Mil Atlas, num só lugar"
        sub="Procure pelos workspaces públicos. Catálogos, acervos, federações."
      />
      <div style={{ padding: "16px 48px 48px" }}>
        <div style={{ maxWidth: 560, marginBottom: 32 }}>
          <Input value={q} onChange={e => setQ(e.target.value)} icon="search" placeholder="ex.: editora, vinhos, museu, cooperativa…" style={{ padding: "14px 14px 14px 40px", fontSize: 16 }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18 }}>
          {[
            { name: "Centro Budista do Brasil", tag: "comunidade", count: "47 templos", color: "var(--pigment-burnt-nectar)" },
            { name: "Editora Veredas",         tag: "catálogo", count: "1.2k livros",  color: "var(--pigment-goldenrod)" },
            { name: "Acervo Memória Atlântica", tag: "museu",    count: "8.4k peças",  color: "var(--pigment-sage)" },
            { name: "Cooperativa Vinhos do Sul", tag: "produto", count: "184 rótulos", color: "var(--pigment-ruby)" },
            { name: "Atlas Linguístico Mineiro", tag: "pesquisa", count: "2.3k entradas", color: "var(--pigment-ink)" },
            { name: "Centro de Estudos Quilombolas", tag: "arquivo", count: "412 registros", color: "var(--pigment-burnt-nectar)" },
          ].map((w, i) => (
            <Card key={i} padded={false} style={{ overflow: "hidden", cursor: "pointer" }}>
              <div style={{ height: 90, background: w.color, position: "relative" }}>
                <span style={{ position: "absolute", left: 14, bottom: 10, fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 38, color: "var(--pigment-parchment)", lineHeight: 1, fontVariationSettings: '"opsz" 144', opacity: 0.9 }}>
                  {w.name.split(" ").slice(0, 2).map(s => s[0]).join("")}
                </span>
              </div>
              <div style={{ padding: 18 }}>
                <Eyebrow style={{ marginBottom: 6 }}>{w.tag}</Eyebrow>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 400, margin: "0 0 6px", letterSpacing: "-0.005em" }}>{w.name}</h3>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>{w.count}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  GROUPS
// ─────────────────────────────────────────────────────────────────────────────

function GroupsScreen() {
  const groups = [...new Set(TABLES.map(t => t.group))];
  return (
    <div>
      <ScreenHeader
        folio={{ n: "09", label: "como tudo se organiza" }}
        eyebrow="Grupos de tabelas"
        title="A organização do acervo"
        sub="Tabelas se agrupam em capítulos. Útil pra navegar e pra dar permissões em bloco."
        actions={<Button icon="plus">Novo grupo</Button>}
      />
      <div style={{ padding: "32px 48px 64px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18 }}>
        {groups.map((g, i) => {
          const tables = TABLES.filter(t => t.group === g);
          return (
            <Card key={g}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <div>
                  <Eyebrow accent style={{ marginBottom: 6 }}>capítulo · {String(i + 1).padStart(2, "0")}</Eyebrow>
                  <h3 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 28, fontWeight: 400, margin: 0 }}>{g}</h3>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>{tables.length} tabelas</span>
              </div>
              <Hairline strong />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tables.map(t => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>{t.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>{t.count.toLocaleString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MASTER PANEL
// ─────────────────────────────────────────────────────────────────────────────

function MasterPanel() {
  return (
    <div>
      <ScreenHeader
        folio={{ n: "10", label: "instância mora" }}
        eyebrow={<span style={{ color: "var(--pigment-ruby)" }}>Modo master · sessão Liana</span>}
        title="Painel master"
        sub="Visão de quem opera o Atlas. Workspaces, quotas, telemetria — sem ver dados de cliente."
        actions={<Button variant="danger" icon="plus">Provisionar workspace</Button>}
      />
      <div style={{ padding: "24px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
          {[
            { n: "4", l: "workspaces ativos", c: "var(--pigment-ink)" },
            { n: "47", l: "tabelas no total", c: "var(--pigment-goldenrod-deep)" },
            { n: "16", l: "moderadores", c: "var(--pigment-sage-deep)" },
            { n: "0.48", l: "TB usados de 2", c: "var(--pigment-ruby)" },
          ].map((s, i) => (
            <Card key={i}>
              <Eyebrow>indicador {String.fromCharCode(65 + i)}</Eyebrow>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 400, color: s.c, lineHeight: 1, marginTop: 10, fontVariationSettings: '"opsz" 144' }}>{s.n}</div>
              <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 13, color: "var(--fg-secondary)", marginTop: 6 }}>{s.l}</div>
            </Card>
          ))}
        </div>

        <Eyebrow style={{ marginBottom: 12 }}>Workspaces sob administração</Eyebrow>
        <Card padded={false}>
          <div style={{ display: "grid", gridTemplateColumns: "60px 2fr 2fr 1fr 1fr 1.5fr 80px", padding: "12px 18px", background: "var(--bg-secondary)", borderBottom: "1px solid var(--rule)", gap: 14, alignItems: "center" }}>
            {["#", "Admin", "Workspace", "Tabelas", "Moderadores", "Quota", ""].map(h => <Eyebrow key={h} style={{ fontSize: 9 }}>{h}</Eyebrow>)}
          </div>
          {ADMINS.map((a, i) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "60px 2fr 2fr 1fr 1fr 1.5fr 80px", padding: "14px 18px", borderBottom: "1px solid var(--rule-faint)", gap: 14, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>{String(i + 1).padStart(2, "0")}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 999, background: "var(--pigment-goldenrod-deep)", color: "var(--pigment-parchment)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 12, fontStyle: "italic" }}>{a.initials}</div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>{a.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)" }}>@{a.username}</div>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 14, color: "var(--fg-primary)" }}>{a.workspace}</div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{a.tables}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{a.mods}</span>
              <div>
                <div style={{ height: 6, background: "var(--rule-faint)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${a.quotaUsed * 100}%`, background: a.quotaUsed > 0.7 ? "var(--pigment-ruby)" : "var(--accent)" }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)", marginTop: 4, display: "block" }}>{Math.round(a.quotaUsed * 100)}%</span>
              </div>
              <Button variant="ghost" size="sm" icon="more">Ações</Button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  QR AUTH — device authorization
// ─────────────────────────────────────────────────────────────────────────────

function QRAuth() {
  const [seconds, setSeconds] = uS4(118);
  React.useEffect(() => {
    const t = setInterval(() => setSeconds(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return (
    <div>
      <ScreenHeader
        folio={{ n: "11", label: "autorizar dispositivo" }}
        eyebrow="QR Auth"
        title="Aproxime, autorize, entre"
        sub="Útil pra moderadores no celular: escaneie o QR de outra sessão Atlas e a permissão flui."
      />

      <div style={{ padding: "32px 48px 64px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {/* QR display */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--bg-elevated)", border: "1px solid var(--rule)", borderRadius: 12 }}>
          <Eyebrow accent style={{ marginBottom: 16 }}>Código deste dispositivo</Eyebrow>
          <FakeQR />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, letterSpacing: "0.3em", color: "var(--fg-primary)", marginTop: 24, fontWeight: 500 }}>
            BUDA-ZA48
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: seconds < 30 ? "var(--pigment-ruby)" : "var(--fg-muted)", marginTop: 12 }}>
            expira em {String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}
          </div>
          <Button variant="ghost" size="sm" style={{ marginTop: 16 }} onClick={() => setSeconds(120)}>Gerar novo código</Button>
        </div>

        <div>
          <Eyebrow style={{ marginBottom: 12 }}>Como usar</Eyebrow>
          <ol style={{ fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1.6, color: "var(--fg-secondary)", paddingLeft: 22, margin: 0, listStyleType: "decimal" }}>
            <li style={{ marginBottom: 10 }}>Abra o Atlas no outro dispositivo (já logado).</li>
            <li style={{ marginBottom: 10 }}>Vá em <em>Conta → Autorizar dispositivo</em>.</li>
            <li style={{ marginBottom: 10 }}>Escaneie este QR <strong>ou</strong> digite o código <code style={{ fontFamily: "var(--font-mono)", background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: 3 }}>BUDA-ZA48</code>.</li>
            <li>Confirme o nome e a localização aproximada deste dispositivo.</li>
          </ol>

          <Hairline strong my={28} />

          <Eyebrow style={{ marginBottom: 12 }}>Sessões ativas</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { device: "MacBook Pro · Chrome", where: "São Paulo, SP", current: true, when: "agora" },
              { device: "iPhone · Safari",      where: "São Paulo, SP", current: false, when: "há 2h" },
              { device: "iPad · Atlas app",     where: "Curitiba, PR", current: false, when: "há 4 dias" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: "1px solid var(--rule)", borderRadius: 8, background: "var(--bg-elevated)" }}>
                <Icon name={s.device.includes("MacBook") ? "layout" : s.device.includes("iPhone") ? "lock" : "qr"} size={18} color="var(--fg-secondary)" />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>{s.device}</span>
                    {s.current && <Badge tone="ok" dot>esta</Badge>}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", marginTop: 3 }}>
                    {s.where} · {s.when}
                  </div>
                </div>
                {!s.current && <Button variant="ghost" size="sm">Encerrar</Button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FakeQR() {
  // Pseudo-random but deterministic QR-ish pattern
  const cells = [];
  const seed = (x, y) => ((x * 73 + y * 97 + x * y * 13) % 11) > 5;
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      // Corner markers
      const corner = (x < 7 && y < 7) || (x >= 14 && y < 7) || (x < 7 && y >= 14);
      const cornerEdge = ((x === 0 || x === 6) && y < 7) || ((y === 0 || y === 6) && x < 7) ||
                         ((x === 14 || x === 20) && y < 7) || ((y === 0 || y === 6) && x >= 14) ||
                         ((x === 0 || x === 6) && y >= 14) || ((y === 14 || y === 20) && x < 7);
      const cornerCenter = (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
                           (x >= 16 && x <= 18 && y >= 2 && y <= 4) ||
                           (x >= 2 && x <= 4 && y >= 16 && y <= 18);
      const fill = corner ? (cornerEdge || cornerCenter) : seed(x, y);
      if (fill) cells.push(<rect key={`${x}-${y}`} x={x * 10} y={y * 10} width="10" height="10" fill="var(--pigment-ink)" />);
    }
  }
  return (
    <svg width="220" height="220" viewBox="0 0 210 210" style={{ background: "var(--pigment-parchment)", borderRadius: 8, padding: 8 }}>
      {cells}
    </svg>
  );
}

Object.assign(window, { PublicDashboard, ExploreScreen, GroupsScreen, MasterPanel, QRAuth });
