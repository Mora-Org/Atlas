/* global React, ReactDOM,
   Icon, Eyebrow, Hairline, Button, Input, Badge, Card, OwlGlyph, MMonogram, Toggle, Folio,
   Sidebar, ScreenHeader, LoginScreen, TablesIndex,
   SchemaEditor, DataGrid,
   ImportScreen, ModeratorsScreen,
   PublicDashboard, ExploreScreen, GroupsScreen, MasterPanel, QRAuth,
   ThemeStudio, PublicSite, getWorkspaceData,
   TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSelect */

const { useState: uA, useEffect: uE } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "persona": "admin",
  "density": "regular",
  "terminology": "tabela",
  "accent": "nectar",
  "mode": "light",
  "workspace": "centrobudista"
}/*EDITMODE-END*/;

const SCREENS = [
  { id: "login",      label: "Login",            num: "01" },
  { id: "tables",     label: "Índice",           num: "02" },
  { id: "schema",     label: "Schema",           num: "03" },
  { id: "grid",       label: "Data Grid",        num: "04" },
  { id: "import",     label: "Importar",         num: "05" },
  { id: "moderators", label: "Moderadores",      num: "06" },
  { id: "dashboard",  label: "Dashboard",        num: "07" },
  { id: "explore",    label: "Explore",          num: "08" },
  { id: "groups",     label: "Grupos",           num: "09" },
  { id: "master",     label: "Painel Master",    num: "10" },
  { id: "qr",         label: "QR Auth",          num: "11" },
  { id: "publish",    label: "Publicar site",    num: "12" },
  { id: "site",       label: "Site público",     num: "13" },
];

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = uA("login");
  // Synchronous swap before render — reassigns the live globals so all
  // screens read the active workspace's data.
  const wsData = window.setActiveWorkspace(tweaks.workspace);

  // Apply theme attributes to <html>
  uE(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", tweaks.mode);
    html.setAttribute("data-accent", tweaks.accent);
  }, [tweaks.mode, tweaks.accent]);

  // when switching persona to non-master, leave master-only screens
  uE(() => {
    if (tweaks.persona !== "master" && (screen === "master" || screen === "qr")) {
      setScreen("tables");
    }
    if (tweaks.persona === "moderator" && ["schema", "import", "moderators", "groups"].includes(screen)) {
      setScreen("grid");
    }
  }, [tweaks.persona]);

  const onNavigate = (id) => {
    if (id === "tables") setScreen("tables");
    else setScreen(id);
  };

  const renderScreen = () => {
    switch (screen) {
      case "login":      return <LoginScreen onComplete={() => setScreen("tables")} workspace={tweaks.workspace} />;
      case "tables":     return <TablesIndex terminology={tweaks.terminology} onOpen={() => setScreen("grid")} ws={wsData} />;
      case "schema":     return <SchemaEditor ws={wsData} />;
      case "grid":       return <DataGrid density={tweaks.density} terminology={tweaks.terminology} onBack={() => setScreen("tables")} ws={wsData} />;
      case "import":     return <ImportScreen ws={wsData} />;
      case "moderators": return <ModeratorsScreen ws={wsData} />;
      case "dashboard":  return <PublicDashboard ws={wsData} />;
      case "explore":    return <ExploreScreen />;
      case "groups":     return <GroupsScreen ws={wsData} />;
      case "master":     return <MasterPanel />;
      case "qr":         return <QRAuth />;
      case "publish":    return <ThemeStudio ws={wsData} />;
      case "site":       return <PublicSite ws={wsData} />;
      default: return null;
    }
  };

  // Login & public site take the whole viewport (no shell)
  if (screen === "login" || screen === "site") {
    return (
      <div style={{ height: "100vh", overflow: "auto" }}>
        {renderScreen()}
        <ScreenPicker screen={screen} setScreen={setScreen} />
        <ThemeQuickToggle tweaks={tweaks} setTweak={setTweak} />
        <TweaksUI tweaks={tweaks} setTweak={setTweak} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-primary)", color: "var(--fg-primary)" }}>
      <Sidebar active={screen} onNavigate={onNavigate} persona={tweaks.persona} terminology={tweaks.terminology} workspace={wsData.WORKSPACE} workspaceId={tweaks.workspace} setWorkspace={(v) => setTweak("workspace", v)} />
      <main style={{ flex: 1, overflow: "auto" }}>
        {renderScreen()}
      </main>
      <ScreenPicker screen={screen} setScreen={setScreen} />
      <ThemeQuickToggle tweaks={tweaks} setTweak={setTweak} />
      <TweaksUI tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
}

// Floating screen picker — always visible, helps navigate
function ScreenPicker({ screen, setScreen }) {
  const [open, setOpen] = uA(false);
  return (
    <div style={{ position: "fixed", left: 16, bottom: 16, zIndex: 100 }}>
      {open && (
        <div style={{
          position: "absolute", bottom: 50, left: 0,
          background: "var(--bg-elevated)", border: "1px solid var(--rule)",
          borderRadius: 10, boxShadow: "var(--shadow-raised)",
          padding: 8, width: 280, maxHeight: 480, overflow: "auto",
        }}>
          <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--rule-faint)", marginBottom: 6 }}>
            <Eyebrow accent>navegar telas</Eyebrow>
          </div>
          {SCREENS.map(s => (
            <button key={s.id} onClick={() => { setScreen(s.id); setOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "8px 10px",
              border: 0, background: screen === s.id ? "var(--accent-soft)" : "transparent",
              borderRadius: 6, cursor: "pointer", textAlign: "left",
              color: screen === s.id ? "var(--accent-text)" : "var(--fg-secondary)",
              fontFamily: "var(--font-sans)", fontSize: 13,
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)", letterSpacing: "0.1em", width: 22 }}>{s.num}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(!open)} style={{
        background: "var(--bg-elevated)", border: "1px solid var(--rule)",
        borderRadius: 999, padding: "8px 14px", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8,
        boxShadow: "var(--shadow-card)", color: "var(--fg-primary)",
        fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
      }}>
        <Icon name={open ? "x" : "list"} size={13} />
        fol. {SCREENS.find(s => s.id === screen)?.num} — {SCREENS.find(s => s.id === screen)?.label}
      </button>
    </div>
  );
}

// Quick theme switcher — embodies the spec's theme switcher component
function ThemeQuickToggle({ tweaks, setTweak }) {
  const accents = [
    { id: "goldenrod", color: "var(--pigment-goldenrod)", name: "Goldenrod" },
    { id: "sage",      color: "var(--pigment-sage)",      name: "Sage" },
    { id: "ruby",      color: "var(--pigment-ruby)",      name: "Ruby" },
    { id: "nectar",    color: "var(--pigment-nectar)",    name: "Burnt Nectar" },
  ];
  return (
    <div style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 99,
      display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
      background: "var(--bg-elevated)", border: "1px solid var(--rule)",
      borderRadius: 999, boxShadow: "var(--shadow-card)",
    }}>
      {accents.map(a => (
        <button key={a.id} onClick={() => setTweak("accent", a.id)} title={a.name} style={{
          width: 22, height: 22, borderRadius: 999, padding: 0,
          background: a.color, border: tweaks.accent === a.id ? "2px solid var(--fg-primary)" : "2px solid transparent",
          cursor: "pointer",
        }} />
      ))}
      <div style={{ width: 1, height: 18, background: "var(--rule)", margin: "0 4px" }} />
      <button onClick={() => setTweak("mode", tweaks.mode === "dark" ? "light" : "dark")} title="Alternar modo" style={{
        width: 26, height: 26, borderRadius: 999, padding: 0,
        background: "transparent", border: 0, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-secondary)",
      }}>
        <Icon name={tweaks.mode === "dark" ? "sun" : "moon"} size={14} />
      </button>
    </div>
  );
}

// Tweaks panel
function TweaksUI({ tweaks, setTweak }) {
  return (
    <TweaksPanel title="Tweaks" subtitle="Persona, densidade & terminologia">
      <TweakSection title="Persona ativa">
        <TweakRadio
          label="Quem vê" value={tweaks.persona}
          onChange={(v) => setTweak("persona", v)}
          options={["master", "admin", "moderator"]}
        />
      </TweakSection>

      <TweakSection title="Data Grid">
        <TweakRadio
          label="Densidade" value={tweaks.density}
          onChange={(v) => setTweak("density", v)}
          options={["compact", "regular", "loose"]}
        />
      </TweakSection>

      <TweakSection title="Workspace ativo">
        <TweakSelect
          label="Exemplo" value={tweaks.workspace}
          onChange={(v) => setTweak("workspace", v)}
          options={[
            { value: "centrobudista", label: "Centros budistas" },
            { value: "igreja",        label: "Igreja presbiteriana" },
            { value: "biblioteca",    label: "Biblioteca de exemplo" },
          ]}
        />
      </TweakSection>

      <TweakSection title="Terminologia">
        <TweakRadio
          label="Vocabulário" value={tweaks.terminology}
          onChange={(v) => setTweak("terminology", v)}
          options={["tabela", "colecao"]}
        />
      </TweakSection>

      <TweakSection title="Tema">
        <TweakSelect
          label="Acento" value={tweaks.accent}
          onChange={(v) => setTweak("accent", v)}
          options={["goldenrod", "sage", "ruby", "nectar"]}
        />
        <TweakRadio
          label="Modo" value={tweaks.mode}
          onChange={(v) => setTweak("mode", v)}
          options={["light", "dark"]}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
