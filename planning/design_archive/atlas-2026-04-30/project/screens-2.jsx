/* global React, Icon, Eyebrow, Hairline, Button, Input, Badge, Card, Toggle, Folio, OwlGlyph,
   ScreenHeader, TEMPLOS_COLUMNS, TEMPLOS_DATA, LINHAGENS, PERSONALIDADES_SAMPLE, TABLES */

const { useState: uS2, useMemo: uM2, useRef: uR2 } = React;

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEMA EDITOR
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_META = {
  integer: { icon: "hash",     label: "número inteiro", hint: "1, 2, 3…" },
  number:  { icon: "hash",     label: "número",          hint: "decimais permitidos" },
  string:  { icon: "text",     label: "texto curto",     hint: "até 255 caracteres" },
  longtext:{ icon: "text",     label: "texto longo",     hint: "parágrafos" },
  date:    { icon: "calendar", label: "data",            hint: "AAAA-MM-DD" },
  boolean: { icon: "bool",     label: "verdadeiro/falso", hint: "checkbox" },
  fk:      { icon: "link",     label: "relacionamento",  hint: "aponta pra outra tabela" },
  json:    { icon: "json",     label: "json",            hint: "objeto estruturado" },
};

function SchemaEditor({ ws }) {
  const wsd = ws || (window.getWorkspaceData ? window.getWorkspaceData(window.WORKSPACE?.id) : null);
  const wsId = wsd?.WORKSPACE?.id || "centrobudista";
  const initialCols = wsd?.PRIMARY_COLUMNS || TEMPLOS_COLUMNS;
  const initialName = wsd?.PRIMARY_TABLE_LABEL?.toLowerCase() || "templos";
  const [cols, setCols] = uS2(initialCols);
  const [selectedId, setSelectedId] = uS2(3);
  const [editingName, setEditingName] = uS2(false);
  const [tableName, setTableName] = uS2(initialName);

  // Rebuild when workspace switches
  React.useEffect(() => {
    setCols(initialCols);
    setTableName(initialName);
    setSelectedId(initialCols[2]?.id || initialCols[0]?.id);
  }, [wsId]);

  const selected = cols.find(c => c.id === selectedId);

  const updateCol = (id, patch) => setCols(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
  const addCol = () => {
    const nid = Math.max(...cols.map(c=>c.id)) + 1;
    setCols([...cols, { id: nid, name: "nova_coluna", type: "string", required: false, unique: false, pk: false, fk: null }]);
    setSelectedId(nid);
  };
  const deleteCol = (id) => {
    setCols(cs => cs.filter(c => c.id !== id));
    if (selectedId === id) setSelectedId(cols[0].id);
  };

  return (
    <div>
      <ScreenHeader
        folio={{ n: "03", label: "esquema · templos" }}
        eyebrow="Editor de schema"
        title={
          editingName ? (
            <input
              autoFocus
              value={tableName}
              onChange={e => setTableName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => e.key === "Enter" && setEditingName(false)}
              style={{
                fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 400,
                background: "var(--bg-elevated)", border: "1px solid var(--accent)",
                borderRadius: 6, padding: "2px 8px", color: "var(--fg-primary)",
                letterSpacing: "-0.02em", outline: "none",
              }} />
          ) : (
            <span onClick={() => setEditingName(true)} style={{ cursor: "text", borderBottom: "1px dashed var(--rule)" }}>
              {tableName}
            </span>
          )
        }
        sub="Esta é a forma da tabela. Defina colunas, tipos e relações antes de povoar."
        actions={<>
          <Button variant="ghost" icon="eye">Pré-visualizar</Button>
          <Button variant="secondary" icon="x">Descartar</Button>
          <Button icon="save">Salvar schema</Button>
        </>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 0, height: "calc(100vh - 220px)" }}>
        {/* Column list */}
        <div style={{ padding: "24px 48px 24px 48px", overflow: "auto", borderRight: "1px solid var(--rule-faint)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
            <Eyebrow>Colunas · {cols.length}</Eyebrow>
            <Button variant="ghost" size="sm" icon="plus" onClick={addCol}>Adicionar coluna</Button>
          </div>

          <div style={{ border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "32px 1fr 200px 80px 80px 32px",
              gap: 0, padding: "10px 14px", background: "var(--bg-secondary)",
              borderBottom: "1px solid var(--rule)", alignItems: "center",
            }}>
              <span></span>
              <Eyebrow style={{ fontSize: 9 }}>Nome</Eyebrow>
              <Eyebrow style={{ fontSize: 9 }}>Tipo</Eyebrow>
              <Eyebrow style={{ fontSize: 9 }}>Obrig.</Eyebrow>
              <Eyebrow style={{ fontSize: 9 }}>Único</Eyebrow>
              <span></span>
            </div>

            {cols.map(c => (
              <button key={c.id} onClick={() => setSelectedId(c.id)} style={{
                display: "grid", gridTemplateColumns: "32px 1fr 200px 80px 80px 32px",
                gap: 0, padding: "12px 14px", alignItems: "center", width: "100%",
                background: selectedId === c.id ? "var(--accent-soft)" : "transparent",
                border: 0, borderBottom: "1px solid var(--rule-faint)",
                cursor: "pointer", textAlign: "left",
              }}>
                <Icon name="drag" size={14} color="var(--fg-muted)" />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-primary)" }}>{c.name}</span>
                  {c.pk && <Badge tone="accent">PK</Badge>}
                  {c.fk && <Badge tone="fk" dot>FK → {c.fk.table}</Badge>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-secondary)" }}>
                  <Icon name={TYPE_META[c.type]?.icon || "text"} size={13} color="var(--fg-muted)" />
                  <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 13 }}>{TYPE_META[c.type]?.label}</span>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: c.required ? "var(--fg-primary)" : "var(--fg-muted)" }}>
                  {c.required ? "sim" : "—"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: c.unique ? "var(--fg-primary)" : "var(--fg-muted)" }}>
                  {c.unique ? "sim" : "—"}
                </span>
                <button onClick={(e) => { e.stopPropagation(); deleteCol(c.id); }} style={{
                  background: "transparent", border: 0, cursor: "pointer", color: "var(--fg-muted)", display: "flex",
                }}>
                  <Icon name="x" size={14} />
                </button>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 24, padding: 18, background: "var(--bg-secondary)", borderRadius: 8, borderLeft: `3px solid var(--accent)` }}>
            <Eyebrow accent style={{ marginBottom: 8 }}>SQL gerado</Eyebrow>
            <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-secondary)", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
{`CREATE TABLE ${tableName} (
${cols.map(c => `  ${c.name.padEnd(16)} ${sqlType(c.type)}${c.required ? " NOT NULL" : ""}${c.unique ? " UNIQUE" : ""}${c.pk ? " PRIMARY KEY" : ""}${c.fk ? `\n    REFERENCES ${c.fk.table}(${c.fk.column})` : ""}`).join(",\n")}
);`}
            </pre>
          </div>
        </div>

        {/* Inspector */}
        <div style={{ padding: "24px 32px", overflow: "auto", background: "var(--bg-secondary)" }}>
          {selected ? (
            <div>
              <Folio n={selected.id} label="inspetor de coluna" />
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, margin: "10px 0 4px" }}>
                {selected.name}
              </h3>
              <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", color: "var(--fg-secondary)", margin: "0 0 24px", fontSize: 13 }}>
                {TYPE_META[selected.type]?.hint}
              </p>

              <Field label="Nome técnico">
                <Input mono value={selected.name} onChange={e => updateCol(selected.id, { name: e.target.value })} />
              </Field>

              <Field label="Tipo">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {Object.entries(TYPE_META).map(([k, m]) => (
                    <button key={k} onClick={() => updateCol(selected.id, { type: k })} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                      background: selected.type === k ? "var(--accent-soft)" : "var(--bg-elevated)",
                      border: `1px solid ${selected.type === k ? "var(--accent)" : "var(--rule)"}`,
                      borderRadius: 6, cursor: "pointer", textAlign: "left",
                      color: selected.type === k ? "var(--accent-text)" : "var(--fg-secondary)",
                      fontSize: 12,
                    }}>
                      <Icon name={m.icon} size={13} />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </Field>

              {selected.type === "fk" && (
                <Field label="Aponta para">
                  <select value={selected.fk?.table || ""} onChange={e => updateCol(selected.id, { fk: { table: e.target.value, column: "id" } })} style={selectStyle}>
                    <option value="">— escolha uma tabela —</option>
                    {TABLES.map(t => <option key={t.id} value={t.name}>{t.label} ({t.name})</option>)}
                  </select>
                </Field>
              )}

              <Hairline strong my={20} />

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Toggle checked={selected.required} onChange={() => updateCol(selected.id, { required: !selected.required })}
                  label="Obrigatório" hint="não pode ficar vazio" />
                <Toggle checked={selected.unique} onChange={() => updateCol(selected.id, { unique: !selected.unique })}
                  label="Único" hint="não admite duplicatas" />
                <Toggle checked={selected.pk} onChange={() => updateCol(selected.id, { pk: !selected.pk })}
                  label="Chave primária" hint="identifica o registro" />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const sqlType = t => ({ integer: "INTEGER", number: "DECIMAL(10,2)", string: "VARCHAR(255)", longtext: "TEXT", date: "DATE", boolean: "BOOLEAN", fk: "INTEGER", json: "JSONB" }[t] || "TEXT");

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: "block", fontFamily: "var(--font-mono)", fontSize: 10,
        letterSpacing: "0.16em", textTransform: "uppercase",
        color: "var(--fg-muted)", marginBottom: 8,
      }}>{label}</label>
      {children}
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
//  DATA GRID — dual visual: dense editorial vs reading cards
// ─────────────────────────────────────────────────────────────────────────────

function DataGrid({ density: densityProp = "regular", onBack, terminology, ws }) {
  const wsd = ws || (window.getWorkspaceData ? window.getWorkspaceData(window.WORKSPACE?.id) : null);
  const wsId = wsd?.WORKSPACE?.id || "centrobudista";
  const initialData = wsd?.PRIMARY_DATA || TEMPLOS_DATA;
  const cats = wsd?.CATEGORIES || LINHAGENS;
  const primaryLabel = wsd?.PRIMARY_TABLE_LABEL || "Templos";
  const primaryNoun = wsd?.WORKSPACE?.primaryNounPlural || "templos";
  const catPlural = wsd?.CATEGORY_LABEL_PLURAL || "linhagens";
  const fkLabel = wsd?.FK_SAMPLE_LABEL || "abade";

  const [data, setData] = uS2(initialData);
  const [editingCell, setEditingCell] = uS2(null); // {rowId, col}
  const [search, setSearch] = uS2("");
  const [filterLinhagem, setFilterLinhagem] = uS2("todas");
  const [visualMode, setVisualMode] = uS2("dense"); // dense | cards
  const density = densityProp;

  React.useEffect(() => {
    setData(initialData);
    setSearch("");
    setFilterLinhagem("todas");
    setEditingCell(null);
  }, [wsId]);

  const filtered = data.filter(r => {
    if (search && !r.nome.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterLinhagem !== "todas" && r.linhagem !== filterLinhagem) return false;
    return true;
  });

  const TERM = terminology === "tabela" ? "tabela" : "coleção";
  const cellPad = density === "compact" ? "6px 12px" : density === "loose" ? "16px 14px" : "10px 12px";
  const fontSize = density === "compact" ? 12 : density === "loose" ? 14 : 13;

  return (
    <div>
      <ScreenHeader
        folio={{ n: "04", label: `${TERM} · ${primaryNoun} · ${data.length} de ${data.length === 12 ? (wsId === "biblioteca" ? "84.231" : wsId === "igreja" ? "38" : "47") : data.length}` }}
        eyebrow={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <button onClick={onBack} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--accent-text)", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              <Icon name="aleft" size={11} /> índice
            </button>
            <span style={{ color: "var(--fg-faint)" }}>·</span>
            <span>{filtered.length} de {data.length}</span>
          </span>
        }
        title={primaryLabel}
        sub={`Cada linha é ${wsId === "biblioteca" ? "uma obra" : wsId === "igreja" ? "uma igreja" : "um templo"}. Clique numa célula pra editá-la.`}
        actions={<>
          <div style={{ display: "flex", border: "1px solid var(--rule)", borderRadius: 6, overflow: "hidden" }}>
            <button onClick={() => setVisualMode("dense")} style={viewToggle(visualMode === "dense")}>
              <Icon name="table" size={14} />
            </button>
            <button onClick={() => setVisualMode("cards")} style={viewToggle(visualMode === "cards")}>
              <Icon name="grid" size={14} />
            </button>
          </div>
          <Button icon="plus">Novo registro</Button>
        </>}
      />

      <div style={{ padding: "20px 48px", display: "flex", gap: 12, alignItems: "center", borderBottom: "1px solid var(--rule-faint)" }}>
        <div style={{ flex: 1, maxWidth: 360 }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome…" icon="search" />
        </div>
        <select value={filterLinhagem} onChange={e => setFilterLinhagem(e.target.value)} style={{...selectStyle, width: 200 }}>
          <option value="todas">Todas {catPlural === "linhagens" ? "as linhagens" : catPlural === "presbitérios" ? "os presbitérios" : `os ${catPlural}`}</option>
          {cats.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
        </select>
        <Button variant="ghost" size="sm" icon="filter">Filtros</Button>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>
          densidade · {density}
        </span>
      </div>

      {visualMode === "dense" ? (
        <div style={{ overflow: "auto", padding: "0 48px 48px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 0, fontSize, fontFamily: "var(--font-sans)" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--fg-primary)" }}>
                {[
                  { key: "id", label: "id", w: 50 },
                  { key: "nome", label: "nome", w: null },
                  { key: "linhagem", label: catPlural === "linhagens" ? "linhagem" : catPlural === "presbitérios" ? "presbitério" : "assunto", w: 140, badge: true },
                  { key: "cidade", label: "cidade", w: 180 },
                  { key: "fundado_em", label: wsId === "biblioteca" ? "publicado em" : wsId === "igreja" ? "fundada em" : "fundado em", w: 120 },
                  { key: "abade", label: fkLabel, w: 180, fk: true },
                  { key: "aberto_publico", label: "público?", w: 100, bool: true },
                  { key: "registros", label: "regs.", w: 70 },
                ].map(c => (
                  <th key={c.key} style={{
                    textAlign: c.key === "id" || c.key === "registros" ? "right" : "left",
                    padding: cellPad, fontFamily: "var(--font-mono)", fontSize: 10,
                    letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--fg-muted)",
                    fontWeight: 500, width: c.w,
                  }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--rule-faint)" }}>
                  <td style={{ ...cellStyle(cellPad), color: "var(--fg-muted)", textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.id}</td>
                  <td style={cellStyle(cellPad)}>
                    <EditableCell value={r.nome} onSave={v => setData(d => d.map(x => x.id === r.id ? { ...x, nome: v } : x))}
                      isEditing={editingCell?.rowId === r.id && editingCell?.col === "nome"}
                      onStart={() => setEditingCell({ rowId: r.id, col: "nome" })}
                      onEnd={() => setEditingCell(null)}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: density === "compact" ? 13 : 15, fontStyle: "italic" }}>{r.nome}</span>
                    </EditableCell>
                  </td>
                  <td style={cellStyle(cellPad)}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px",
                      background: "color-mix(in oklab, var(--pigment-goldenrod) 18%, transparent)",
                      color: "var(--pigment-goldenrod-deep)", borderRadius: 3,
                      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
                    }}>
                      <Icon name="link" size={9} /> {r.linhagem}
                    </span>
                  </td>
                  <td style={cellStyle(cellPad)}>{r.cidade}</td>
                  <td style={{ ...cellStyle(cellPad), fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-secondary)" }}>{r.fundado_em}</td>
                  <td style={cellStyle(cellPad)}>
                    {r.abade ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--fg-secondary)" }}>
                        <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--pigment-sage-deep)", color: "var(--pigment-parchment)", fontFamily: "var(--font-mono)", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>
                          {r.abade.split(" ").map(s=>s[0]).slice(0,2).join("")}
                        </span>
                        {r.abade}
                      </span>
                    ) : <span style={{ color: "var(--fg-muted)", fontStyle: "italic", fontFamily: "var(--font-display)" }}>vago</span>}
                  </td>
                  <td style={cellStyle(cellPad)}>
                    {r.aberto_publico ? (
                      <Icon name="check" size={14} color="var(--pigment-sage-deep)" />
                    ) : (
                      <Icon name="x" size={14} color="var(--fg-muted)" />
                    )}
                  </td>
                  <td style={{ ...cellStyle(cellPad), textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--fg-secondary)" }}>{r.registros}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.1em" }}>
              Mostrando {filtered.length} de {data.length} · página 1 de 4
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <Button variant="ghost" size="sm" icon="aleft">Anterior</Button>
              <Button variant="ghost" size="sm" iconRight="aright">Próxima</Button>
            </div>
          </div>
        </div>
      ) : (
        // CARDS visual mode — reading mode
        <div style={{ padding: "32px 48px 64px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 18 }}>
          {filtered.map(r => (
            <Card key={r.id} padded={false}>
              <div style={{ padding: "14px 18px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--rule-faint)" }}>
                <Eyebrow>id · {String(r.id).padStart(3, "0")}</Eyebrow>
                {r.aberto_publico ? <Badge tone="public" dot>público</Badge> : <Badge tone="private" dot>fechado</Badge>}
              </div>
              <div style={{ padding: "16px 18px 14px" }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 22, fontWeight: 400, margin: "0 0 4px", lineHeight: 1.15 }}>{r.nome}</h3>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--fg-secondary)", marginBottom: 12 }}>{r.cidade} · fundado em {r.fundado_em.slice(0,4)}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <Badge tone="fk" dot>{r.linhagem}</Badge>
                  {r.abade && <Badge tone="neutral">{fkLabel} · {r.abade}</Badge>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 10, borderTop: "1px solid var(--rule-faint)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--fg-muted)" }}>registros vinculados</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--accent-text)" }}>{r.registros}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function cellStyle(pad) {
  return { padding: pad, color: "var(--fg-primary)", verticalAlign: "middle" };
}

function EditableCell({ value, onSave, isEditing, onStart, onEnd, children }) {
  const [v, setV] = uS2(value);
  if (isEditing) {
    return (
      <input
        autoFocus
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => { onSave(v); onEnd(); }}
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(v); onEnd(); }
          if (e.key === "Escape") onEnd();
        }}
        style={{
          width: "100%", fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 15,
          background: "var(--accent-soft)", border: "1px solid var(--accent)",
          borderRadius: 4, padding: "2px 6px", color: "var(--fg-primary)", outline: "none",
        }}
      />
    );
  }
  return (
    <span onDoubleClick={onStart} style={{ cursor: "text", display: "inline-block", padding: "1px 0" }}>
      {children}
    </span>
  );
}

Object.assign(window, { SchemaEditor, DataGrid });
