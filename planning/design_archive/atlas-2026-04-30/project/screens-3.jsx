/* global React, Icon, Eyebrow, Hairline, Button, Input, Badge, Card, Toggle, Folio, OwlGlyph,
   ScreenHeader, SQL_DRY_RUN, SHEET_HEADERS, MODERATORS, TABLES */

const { useState: uS3, useMemo: uM3 } = React;

// ─────────────────────────────────────────────────────────────────────────────
//  IMPORT — landing + SQL + Spreadsheet
// ─────────────────────────────────────────────────────────────────────────────

function ImportScreen({ ws }) {
  const [mode, setMode] = uS3("landing"); // landing | sql | sheet

  if (mode === "sql") return <ImportSQL onBack={() => setMode("landing")} ws={ws} />;
  if (mode === "sheet") return <ImportSheet onBack={() => setMode("landing")} ws={ws} />;

  return (
    <div>
      <ScreenHeader
        folio={{ n: "05", label: "trazer dados de fora" }}
        eyebrow="Importar"
        title="De onde vêm os dados?"
        sub="Atlas trata cada importação como um manuscrito — primeiro lemos, depois escrevemos."
      />
      <div style={{ padding: "32px 48px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <ImportCard
          label="Importação técnica" num="A"
          title="A partir de SQL"
          desc="Cole um arquivo .sql ou .dump. Atlas faz dry-run, mostra o que vai criar, e bloqueia o que for destrutivo."
          tags={["CREATE", "INSERT", "dry-run"]}
          onClick={() => setMode("sql")}
        />
        <ImportCard
          label="Importação editorial" num="B"
          title="A partir de planilha"
          desc="Excel, CSV ou Google Sheets. Atlas adivinha tipos, sugere relações, e deixa você revisar antes de gravar."
          tags={["xlsx", "csv", "auto-tipo"]}
          onClick={() => setMode("sheet")}
        />
      </div>
    </div>
  );
}

function ImportCard({ label, num, title, desc, tags, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "var(--bg-elevated)", border: "1px solid var(--rule)", borderRadius: 12,
      padding: 28, textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 14,
      minHeight: 280, transition: "all var(--duration-fast)",
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--rule)"; e.currentTarget.style.transform = "translateY(0)"; }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <Eyebrow>{label}</Eyebrow>
        <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 56, color: "var(--accent-soft)", lineHeight: 1, fontVariationSettings: '"opsz" 144' }}>{num}</span>
      </div>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, margin: 0, letterSpacing: "-0.01em" }}>{title}</h3>
      <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 15, color: "var(--fg-secondary)", margin: 0, lineHeight: 1.5 }}>{desc}</p>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tags.map(t => <Badge key={t} tone="neutral">{t}</Badge>)}
      </div>
    </button>
  );
}

// ── SQL Import ─────────────────────────────────────────────────────────────

function ImportSQL({ onBack, ws }) {
  const wsd = ws || (window.getWorkspaceData ? window.getWorkspaceData(window.WORKSPACE?.id) : null);
  const dryRun = wsd?.SQL_DRY_RUN || SQL_DRY_RUN;
  const [pasted, setPasted] = uS3(true);
  const ok = dryRun.filter(s => s.status === "ok").length;
  const blocked = dryRun.filter(s => s.status === "blocked").length;
  const conflicts = dryRun.filter(s => s.status === "conflict").length;

  return (
    <div>
      <ScreenHeader
        folio={{ n: "05·a", label: "import SQL" }}
        eyebrow={
          <button onClick={onBack} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--accent-text)", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            <Icon name="aleft" size={11} /> escolher origem
          </button>
        }
        title="Dry-run · retiros.sql"
        sub="Antes de tocar no banco, Atlas explica o que vai fazer. Você decide."
        actions={<>
          <Button variant="secondary" icon="x" onClick={onBack}>Cancelar</Button>
          <Button icon="check" disabled={blocked > 0}>Executar {ok} operações</Button>
        </>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, height: "calc(100vh - 280px)" }}>
        {/* Left — SQL */}
        <div style={{ padding: "20px 32px 20px 48px", borderRight: "1px solid var(--rule-faint)", overflow: "auto" }}>
          <Eyebrow style={{ marginBottom: 10 }}>arquivo · 218 linhas · 4.2 KB</Eyebrow>
          <pre style={{
            fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7,
            background: "var(--bg-secondary)", border: "1px solid var(--rule)",
            borderRadius: 8, padding: 16, color: "var(--fg-primary)",
            overflow: "auto", margin: 0,
          }}>
{`-- retiros.sql · exportado de PostgreSQL 15
${syntax("CREATE TABLE")} retiros (
  id          ${syntax("INTEGER", "fk")} PRIMARY KEY,
  nome        ${syntax("VARCHAR(200)", "fk")} NOT NULL,
  templo_id   ${syntax("INTEGER", "fk")} REFERENCES templos(id),
  inicia_em   ${syntax("DATE", "fk")} NOT NULL,
  termina_em  ${syntax("DATE", "fk")},
  vagas       ${syntax("INTEGER", "fk")} DEFAULT 0,
  preco       ${syntax("DECIMAL(10,2)", "fk")},
  observacoes ${syntax("TEXT", "fk")}
);

${syntax("CREATE TABLE")} instrutores ( ... );

${syntax("INSERT INTO")} retiros ${syntax("VALUES", "ok")}
  (1, 'Sesshin de outono', 1, '2026-04-15', ...),
  (2, 'Retiro de silêncio', 4, '2026-05-22', ...),
  ${`-- 228 linhas a mais`}

${syntax("DROP TABLE")} ${syntax("linhagens", "danger")};   ${syntax("-- ⚠ destrutivo", "danger")}
${syntax("ALTER TABLE")} ${syntax("personalidades", "danger")} ...`}
          </pre>
        </div>

        {/* Right — Dry-run */}
        <div style={{ padding: "20px 48px 20px 32px", overflow: "auto" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <SQLStat tone="ok" n={ok} label="vão executar" />
            <SQLStat tone="warn" n={conflicts} label="conflitos" />
            <SQLStat tone="danger" n={blocked} label="bloqueadas" />
          </div>

          <Eyebrow style={{ marginBottom: 10 }}>plano de execução</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dryRun.map((op, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "20px 110px 1fr",
                gap: 10, alignItems: "flex-start",
                padding: "10px 12px",
                background: "var(--bg-elevated)",
                border: `1px solid ${op.status === "blocked" ? "color-mix(in oklab, var(--pigment-ruby) 30%, transparent)" : op.status === "conflict" ? "color-mix(in oklab, var(--pigment-goldenrod) 35%, transparent)" : "var(--rule)"}`,
                borderLeft: `3px solid ${op.status === "ok" ? "var(--pigment-sage-deep)" : op.status === "conflict" ? "var(--pigment-goldenrod)" : "var(--pigment-ruby)"}`,
                borderRadius: 4,
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)", marginTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
                <code style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-text)",
                  letterSpacing: "0.04em", marginTop: 1,
                }}>{op.type}</code>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-primary)", marginBottom: 2 }}>{op.target}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.4 }}>{op.msg}</div>
                </div>
              </div>
            ))}
          </div>

          {blocked > 0 && (
            <div style={{
              marginTop: 18, padding: 14, background: "color-mix(in oklab, var(--pigment-ruby) 8%, transparent)",
              border: "1px solid color-mix(in oklab, var(--pigment-ruby) 25%, transparent)", borderRadius: 6,
              display: "flex", gap: 10,
            }}>
              <Icon name="alert" size={16} color="var(--pigment-ruby)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--fg-primary)", marginBottom: 4 }}>
                  {blocked} operação{blocked > 1 ? "ões" : ""} bloqueada{blocked > 1 ? "s" : ""}
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.5 }}>
                  Atlas não executa DROP, ALTER ou TRUNCATE em import. Edite o arquivo e refaça.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SQLStat({ tone, n, label }) {
  const c = tone === "ok" ? "var(--pigment-sage-deep)" : tone === "warn" ? "var(--pigment-goldenrod-deep)" : "var(--pigment-ruby)";
  return (
    <div style={{ flex: 1, padding: 12, border: `1px solid color-mix(in oklab, ${c} 30%, transparent)`, borderRadius: 6, background: `color-mix(in oklab, ${c} 6%, transparent)` }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: c, lineHeight: 1, fontVariationSettings: '"opsz" 96' }}>{n}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--fg-muted)", textTransform: "uppercase", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function syntax(text, tone) {
  const colors = { ok: "var(--pigment-sage-deep)", danger: "var(--pigment-ruby)", fk: "var(--pigment-goldenrod-deep)" };
  return text;  // we just return text — pre-formatted; using template literal interpolation
}

// ── Spreadsheet Import ─────────────────────────────────────────────────────

function ImportSheet({ onBack, ws }) {
  const wsd = ws || (window.getWorkspaceData ? window.getWorkspaceData(window.WORKSPACE?.id) : null);
  const wsId = wsd?.WORKSPACE?.id || "centrobudista";
  const initialHeaders = wsd?.SHEET_HEADERS || SHEET_HEADERS;
  const initialName = wsId === "biblioteca" ? "obras_outono" : wsId === "igreja" ? "membros_2026" : "produtos_outono";
  const [headers, setHeaders] = uS3(initialHeaders);
  const [tableName, setTableName] = uS3(initialName);
  React.useEffect(() => { setHeaders(initialHeaders); setTableName(initialName); }, [wsId]);
  const updateHeader = (i, patch) => setHeaders(hs => hs.map((h, idx) => idx === i ? { ...h, ...patch } : h));

  return (
    <div>
      <ScreenHeader
        folio={{ n: "05·b", label: "import planilha" }}
        eyebrow={
          <button onClick={onBack} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--accent-text)", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            <Icon name="aleft" size={11} /> escolher origem
          </button>
        }
        title="Mapear · catalogo-loja-outono.xlsx"
        sub="Sua planilha tem 8 colunas e 184 linhas. Atlas adivinhou os tipos — confirme antes de importar."
        actions={<>
          <Button variant="secondary" onClick={onBack}>Cancelar</Button>
          <Button icon="check">Importar 184 linhas</Button>
        </>}
      />

      <div style={{ padding: "24px 48px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
          <Card>
            <Eyebrow style={{ marginBottom: 8 }}>Nome da tabela</Eyebrow>
            <Input mono value={tableName} onChange={e => setTableName(e.target.value)} />
            <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 12, color: "var(--fg-muted)", margin: "10px 0 0" }}>Use snake_case. Atlas converte espaços e remove acentos.</p>
          </Card>
          <Card>
            <Eyebrow style={{ marginBottom: 8 }}>Resumo da leitura</Eyebrow>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 6 }}>
              {[
                ["8", "colunas"], ["184", "linhas"], ["1", "FK detectada"], ["3", "tipos auto."],
              ].map(([n, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1, color: "var(--fg-primary)" }}>{n}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--fg-muted)", textTransform: "uppercase", marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Eyebrow style={{ marginBottom: 12 }}>Mapeamento das colunas</Eyebrow>
        <Card padded={false}>
          <div style={{
            display: "grid", gridTemplateColumns: "32px 2fr 2fr 1.5fr 2fr 60px",
            gap: 16, padding: "12px 18px", background: "var(--bg-secondary)",
            borderBottom: "1px solid var(--rule)", alignItems: "center",
          }}>
            <span></span>
            <Eyebrow style={{ fontSize: 9 }}>Cabeçalho da planilha</Eyebrow>
            <Eyebrow style={{ fontSize: 9 }}>Nome no banco</Eyebrow>
            <Eyebrow style={{ fontSize: 9 }}>Tipo</Eyebrow>
            <Eyebrow style={{ fontSize: 9 }}>Amostra</Eyebrow>
            <span></span>
          </div>
          {headers.map((h, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "32px 2fr 2fr 1.5fr 2fr 60px",
              gap: 16, padding: "14px 18px", alignItems: "center",
              borderBottom: "1px solid var(--rule-faint)",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>{String.fromCharCode(65 + i)}</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--fg-primary)" }}>{h.header}</span>
              <Input mono value={h.fieldName} onChange={e => updateHeader(i, { fieldName: e.target.value })} style={{ padding: "6px 10px", fontSize: 12 }} />
              <select value={h.suggested} onChange={e => updateHeader(i, { suggested: e.target.value })} style={{ ...selectStyle, padding: "6px 10px", fontSize: 12 }}>
                {["string", "longtext", "integer", "number", "boolean", "date", "fk", "json"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>{h.sample}</span>
              <button style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--fg-muted)" }}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

const selectStyle = {
  width: "100%", fontFamily: "var(--font-sans)", fontSize: 13,
  padding: "9px 12px", borderRadius: 6,
  background: "var(--bg-elevated)", border: "1px solid var(--rule)",
  color: "var(--fg-primary)", outline: "none",
};

// ─────────────────────────────────────────────────────────────────────────────
//  MODERATORS — list + permissions matrix
// ─────────────────────────────────────────────────────────────────────────────

function buildPerms(mods, tables) {
  const init = {};
  mods.forEach(m => {
    init[m.id] = {};
    tables.forEach(t => {
      init[m.id][t.name] = m.tables.includes(t.name)
        ? { read: true, write: true, delete: false }
        : { read: false, write: false, delete: false };
    });
  });
  return init;
}

function ModeratorsScreen({ ws }) {
  const wsd = ws || (window.getWorkspaceData ? window.getWorkspaceData(window.WORKSPACE?.id) : null);
  const wsId = wsd?.WORKSPACE?.id || "centrobudista";
  const mods = wsd?.MODERATORS || MODERATORS;
  const tables = wsd?.TABLES || TABLES;

  const [selected, setSelected] = uS3(mods[0]);
  const [perms, setPerms] = uS3(() => buildPerms(mods, tables));

  React.useEffect(() => {
    setSelected(mods[0]);
    setPerms(buildPerms(mods, tables));
  }, [wsId]);

  const togglePerm = (modId, table, perm) => {
    setPerms(p => ({
      ...p, [modId]: { ...p[modId], [table]: { ...p[modId][table], [perm]: !p[modId][table][perm] } }
    }));
  };

  return (
    <div>
      <ScreenHeader
        folio={{ n: "06", label: "quem pode tocar em quê" }}
        eyebrow={`${mods.length} moderadores · ${tables.length} tabelas`}
        title="Moderadores"
        sub="O chão de fábrica. Cada moderador vê apenas as tabelas que você der."
        actions={<Button icon="plus">Convidar moderador</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", height: "calc(100vh - 230px)" }}>
        {/* Left list */}
        <div style={{ borderRight: "1px solid var(--rule-faint)", padding: "16px 0", overflow: "auto" }}>
          {mods.map(m => (
            <button key={m.id} onClick={() => setSelected(m)} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 24px", width: "100%", border: 0, background: selected.id === m.id ? "var(--accent-soft)" : "transparent",
              cursor: "pointer", textAlign: "left", borderLeft: `3px solid ${selected.id === m.id ? "var(--accent)" : "transparent"}`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 999,
                background: "var(--pigment-sage-deep)", color: "var(--pigment-parchment)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontSize: 13, fontStyle: "italic",
              }}>{m.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--fg-primary)" }}>{m.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)", letterSpacing: "0.04em", marginTop: 2 }}>
                  @{m.username} · {m.lastSeen}
                </div>
              </div>
              <Badge tone="moderator">{m.tables.length}</Badge>
            </button>
          ))}
        </div>

        {/* Permissions matrix */}
        <div style={{ padding: "20px 48px", overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 999,
              background: "var(--pigment-sage-deep)", color: "var(--pigment-parchment)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-display)", fontSize: 22, fontStyle: "italic",
            }}>{selected.initials}</div>
            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 400, margin: 0 }}>{selected.name}</h2>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", marginTop: 4 }}>
                @{selected.username} · ativo {selected.lastSeen}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" icon="email">Reenviar convite</Button>
            <Button variant="ghost" size="sm" icon="block">Suspender</Button>
          </div>

          <Eyebrow style={{ marginBottom: 10 }}>Matriz de permissões</Eyebrow>
          <Card padded={false}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 100px",
              padding: "10px 18px", background: "var(--bg-secondary)", borderBottom: "1px solid var(--rule)",
              alignItems: "center", gap: 12,
            }}>
              <Eyebrow style={{ fontSize: 9 }}>Tabela</Eyebrow>
              <Eyebrow style={{ fontSize: 9, textAlign: "center" }}>ler</Eyebrow>
              <Eyebrow style={{ fontSize: 9, textAlign: "center" }}>escrever</Eyebrow>
              <Eyebrow style={{ fontSize: 9, textAlign: "center" }}>apagar</Eyebrow>
              <Eyebrow style={{ fontSize: 9, textAlign: "center" }}>resumo</Eyebrow>
            </div>
            {tables.map(t => {
              const p = perms[selected.id][t.name];
              const summary = p.read && p.write && p.delete ? "total" : p.read && p.write ? "edita" : p.read ? "lê" : "—";
              return (
                <div key={t.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 100px",
                  padding: "12px 18px", borderBottom: "1px solid var(--rule-faint)",
                  alignItems: "center", gap: 12,
                }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--fg-primary)" }}>{t.label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)" }}>{t.name} · {t.count} regs.</div>
                  </div>
                  <PermBox checked={p.read} onChange={() => togglePerm(selected.id, t.name, "read")} />
                  <PermBox checked={p.write} disabled={!p.read} onChange={() => togglePerm(selected.id, t.name, "write")} />
                  <PermBox checked={p.delete} disabled={!p.write} onChange={() => togglePerm(selected.id, t.name, "delete")} danger />
                  <div style={{ textAlign: "center" }}>
                    {summary === "total" ? <Badge tone="moderator">total</Badge> :
                     summary === "edita" ? <Badge tone="accent">edita</Badge> :
                     summary === "lê" ? <Badge tone="neutral">lê</Badge> :
                     <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>—</span>}
                  </div>
                </div>
              );
            })}
          </Card>

          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 13, color: "var(--fg-muted)", marginTop: 16 }}>
            Permissões herdam: para escrever é preciso ler; para apagar é preciso escrever.
          </p>
        </div>
      </div>
    </div>
  );
}

function PermBox({ checked, onChange, disabled, danger }) {
  return (
    <button onClick={onChange} disabled={disabled} style={{
      width: 22, height: 22, borderRadius: 4,
      border: `1px solid ${disabled ? "var(--rule-faint)" : checked ? (danger ? "var(--pigment-ruby)" : "var(--accent)") : "var(--rule)"}`,
      background: checked ? (danger ? "var(--pigment-ruby)" : "var(--accent)") : "var(--bg-elevated)",
      cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      margin: "0 auto", opacity: disabled ? 0.4 : 1,
    }}>
      {checked && <Icon name="check" size={12} color="var(--fg-inverse)" />}
    </button>
  );
}

Object.assign(window, { ImportScreen, ModeratorsScreen });
