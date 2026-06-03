'use client';

import React, { createContext, useCallback, useContext, useEffect, useReducer, useState } from 'react';
import { useAuth } from '@/components/AuthContext';

/* ───────────────────────────── tipos ───────────────────────────── */

export type Density = 'compact' | 'regular' | 'comfy';
export type LayoutType = 'list' | 'grid' | 'essay';
export type PresetId = 'editorial' | 'moderno' | 'monastico' | 'academico' | 'custom';

export interface ThemeTypography {
  display: { family: string; italic: boolean; size: number; weight: number };
  body: { family: string };
  mono: { family: string };
}

export interface ThemeColors {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  rule: string;
}

export interface ThemeLayout {
  density: Density;
  radius: number;
  default_table_layout: LayoutType;
}

export interface ThemeCopy {
  hero_eyebrow: string;
  hero_title: string;
  hero_sub: string;
  footer_note: string;
}

export interface ThemeConfig {
  version: 1;
  preset: PresetId;
  typography: ThemeTypography;
  colors: ThemeColors;
  layout: ThemeLayout;
  copy: ThemeCopy;
}

export interface TableSelection {
  table_id: number;
  order: number;
  layout: LayoutType;
}

export interface PublishDraftState {
  theme_config: ThemeConfig;
  tables: TableSelection[];
  is_dirty: boolean;
  active_version_id: number | null;
}

/* ──────────────────────── presets do handoff ──────────────────────── */

const DEFAULT_COPY: ThemeCopy = {
  hero_eyebrow: 'Acervo público',
  hero_title: 'O acervo, aberto.',
  hero_sub: 'Pesquise por autor, assunto, ano ou coleção.',
  footer_note: 'CC BY-SA 4.0',
};

export const PRESETS: Record<Exclude<PresetId, 'custom'>, { name: string; hint: string; config: ThemeConfig }> = {
  editorial: {
    name: 'Editorial',
    hint: 'Fraunces · pergaminho',
    config: {
      version: 1,
      preset: 'editorial',
      typography: {
        display: { family: "'Fraunces', Georgia, serif", italic: true, size: 88, weight: 400 },
        body: { family: "'IBM Plex Serif', Georgia, serif" },
        mono: { family: "'IBM Plex Mono', monospace" },
      },
      colors: { bg: '#FAEFD9', surface: '#FFFCF3', ink: '#212842', muted: '#4A5468', accent: '#C2441C', rule: '#212842' },
      layout: { density: 'comfy', radius: 4, default_table_layout: 'list' },
      copy: { ...DEFAULT_COPY },
    },
  },
  moderno: {
    name: 'Moderno',
    hint: 'Inter · contraste alto',
    config: {
      version: 1,
      preset: 'moderno',
      typography: {
        display: { family: "'Inter', system-ui, sans-serif", italic: false, size: 64, weight: 600 },
        body: { family: "'Inter', system-ui, sans-serif" },
        mono: { family: "'JetBrains Mono', monospace" },
      },
      colors: { bg: '#F5F5F4', surface: '#FFFFFF', ink: '#0A0A0A', muted: '#525252', accent: '#0A0A0A', rule: '#E5E5E5' },
      layout: { density: 'regular', radius: 12, default_table_layout: 'grid' },
      copy: { ...DEFAULT_COPY },
    },
  },
  monastico: {
    name: 'Monástico',
    hint: 'EB Garamond · sépia',
    config: {
      version: 1,
      preset: 'monastico',
      typography: {
        display: { family: "'EB Garamond', Garamond, serif", italic: true, size: 96, weight: 400 },
        body: { family: "'EB Garamond', Georgia, serif" },
        mono: { family: "'IBM Plex Mono', monospace" },
      },
      colors: { bg: '#F4ECDC', surface: '#FAF4E6', ink: '#2A1F0F', muted: '#5C4A2E', accent: '#852E47', rule: '#8B6F3E' },
      layout: { density: 'comfy', radius: 0, default_table_layout: 'essay' },
      copy: { ...DEFAULT_COPY },
    },
  },
  academico: {
    name: 'Acadêmico',
    hint: 'Plex Serif · sálvia',
    config: {
      version: 1,
      preset: 'academico',
      typography: {
        display: { family: "'IBM Plex Serif', Georgia, serif", italic: false, size: 56, weight: 500 },
        body: { family: "'IBM Plex Sans', system-ui, sans-serif" },
        mono: { family: "'IBM Plex Mono', monospace" },
      },
      colors: { bg: '#EFEFE2', surface: '#F8F8EE', ink: '#2D3328', muted: '#5F6E4D', accent: '#5F6E4D', rule: '#5F6E4D' },
      layout: { density: 'regular', radius: 6, default_table_layout: 'list' },
      copy: { ...DEFAULT_COPY },
    },
  },
};

export const ACCENT_SWATCHES = ['#C2441C', '#852E47', '#5F6E4D', '#A87A1F', '#0A0A0A', '#0D244D'];

export const DISPLAY_FONTS = [
  { id: 'fraunces', family: "'Fraunces', Georgia, serif", label: 'Fraunces', italic: true },
  { id: 'garamond', family: "'EB Garamond', Garamond, serif", label: 'EB Garamond', italic: true },
  { id: 'plex-serif', family: "'IBM Plex Serif', Georgia, serif", label: 'Plex Serif', italic: false },
  { id: 'inter', family: "'Inter', system-ui, sans-serif", label: 'Inter', italic: false },
];

export const BODY_FONTS = [
  { id: 'plex-sans', family: "'IBM Plex Sans', system-ui, sans-serif", label: 'Plex Sans' },
  { id: 'plex-serif', family: "'IBM Plex Serif', Georgia, serif", label: 'Plex Serif' },
  { id: 'inter', family: "'Inter', system-ui, sans-serif", label: 'Inter' },
  { id: 'garamond', family: "'EB Garamond', Georgia, serif", label: 'EB Garamond' },
];

/* ───────────────────────────── reducer ───────────────────────────── */

type PublishAction =
  | { type: 'APPLY_PRESET'; presetId: Exclude<PresetId, 'custom'> }
  | { type: 'PATCH_CONFIG'; path: string; value: unknown }
  | { type: 'SET_TABLES'; tables: TableSelection[] }
  | { type: 'LOAD_DRAFT'; payload: Partial<PublishDraftState> }
  | { type: 'MARK_CLEAN'; activeVersionId?: number };

function setDeep<T extends object>(obj: T, path: string, value: unknown): T {
  const next = JSON.parse(JSON.stringify(obj)) as T;
  const keys = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = next;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
  return next;
}

const initialState: PublishDraftState = {
  theme_config: PRESETS.editorial.config,
  tables: [],
  is_dirty: false,
  active_version_id: null,
};

function publishReducer(state: PublishDraftState, action: PublishAction): PublishDraftState {
  switch (action.type) {
    case 'APPLY_PRESET':
      return {
        ...state,
        theme_config: { ...PRESETS[action.presetId].config, copy: state.theme_config.copy },
        is_dirty: true,
      };
    case 'PATCH_CONFIG': {
      const patched = setDeep(state.theme_config, action.path, action.value);
      // Qualquer alteração manual marca como custom (a não ser que o path seja `copy.*`,
      // que conta como "conteúdo editorial", não estrutural — não desmarca o preset).
      const isCopy = action.path.startsWith('copy.');
      return {
        ...state,
        theme_config: isCopy ? patched : { ...patched, preset: 'custom' },
        is_dirty: true,
      };
    }
    case 'SET_TABLES':
      return { ...state, tables: action.tables, is_dirty: true };
    case 'LOAD_DRAFT':
      return { ...state, ...action.payload, is_dirty: false };
    case 'MARK_CLEAN':
      return {
        ...state,
        is_dirty: false,
        active_version_id: action.activeVersionId ?? state.active_version_id,
      };
    default:
      return state;
  }
}

/* ───────────────────────────── context ───────────────────────────── */

interface PublishContextProps {
  state: PublishDraftState;
  dispatch: React.Dispatch<PublishAction>;
  applyPreset: (id: Exclude<PresetId, 'custom'>) => void;
  patch: (path: string, value: unknown) => void;
  // Async backend ops
  loadingDraft: boolean;
  publishing: boolean;
  publishError: string | null;
  publishChanges: (description?: string) => Promise<void>;
  reloadActive: () => Promise<void>;
  // Histórico de versões
  versions: VersionResponse[];
  loadingVersions: boolean;
  versionActionId: number | null;
  versionError: string | null;
  loadVersions: () => Promise<void>;
  rollbackTo: (id: number) => Promise<void>;
  deleteVersion: (id: number) => Promise<void>;
}

const PublishContext = createContext<PublishContextProps | undefined>(undefined);

export interface VersionResponse {
  id: number;
  owner_id: number;
  version_number: number;
  created_at: string;
  is_active: boolean;
  description: string | null;
  theme_config: ThemeConfig;
  table_selection: TableSelection[];
}

export function PublishProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(publishReducer, initialState);
  const { token } = useAuth();
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionResponse[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionActionId, setVersionActionId] = useState<number | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const applyPreset = (id: Exclude<PresetId, 'custom'>) =>
    dispatch({ type: 'APPLY_PRESET', presetId: id });

  const patch = (path: string, value: unknown) =>
    dispatch({ type: 'PATCH_CONFIG', path, value });

  // Carrega versão ativa do backend pra hidratar rascunho inicial.
  // Sem versão ativa (workspace nunca publicou), mantém o initialState
  // que é o preset editorial + tabelas vazias.
  const reloadActive = useCallback(async () => {
    if (!token) return;
    setLoadingDraft(true);
    try {
      const r = await fetch(`${API}/api/publications/me/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 404) return; // sem versão ativa, ok
      if (!r.ok) throw new Error(`GET active falhou: ${r.status}`);
      const v: VersionResponse = await r.json();
      dispatch({
        type: 'LOAD_DRAFT',
        payload: {
          theme_config: v.theme_config,
          tables: v.table_selection,
          active_version_id: v.id,
        },
      });
    } catch (e) {
      // Falha de load não deve travar o Studio — admin ainda pode editar
      // do zero. Loga e segue.
      console.error('reloadActive:', e);
    } finally {
      setLoadingDraft(false);
    }
  }, [API, token]);

  // Lista todas as versões publicadas (ordenadas DESC pelo backend) pro histórico.
  const loadVersions = useCallback(async () => {
    if (!token) return;
    setLoadingVersions(true);
    try {
      const r = await fetch(`${API}/api/publications/me/versions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`GET versions falhou: ${r.status}`);
      const list: VersionResponse[] = await r.json();
      setVersions(list);
    } catch (e) {
      // Falha de load não trava o Studio; histórico só fica vazio.
      console.error('loadVersions:', e);
    } finally {
      setLoadingVersions(false);
    }
  }, [API, token]);

  useEffect(() => {
    reloadActive();
    loadVersions();
  }, [reloadActive, loadVersions]);

  // Cria versão nova + ativa imediatamente (snapshot + publish atômicos
  // do ponto de vista do admin, mesmo que backend faça em 2 calls).
  const publishChanges = useCallback(
    async (description?: string) => {
      if (!token) {
        setPublishError('Sem sessão ativa');
        return;
      }
      setPublishing(true);
      setPublishError(null);
      try {
        const createR = await fetch(`${API}/api/publications/me/versions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            description: description ?? null,
            theme_config: state.theme_config,
            table_selection: state.tables,
          }),
        });
        if (!createR.ok) {
          const txt = await createR.text();
          throw new Error(`POST versions ${createR.status}: ${txt}`);
        }
        const created: VersionResponse = await createR.json();

        const actR = await fetch(`${API}/api/publications/me/versions/${created.id}/activate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!actR.ok) {
          const txt = await actR.text();
          throw new Error(`activate ${actR.status}: ${txt}`);
        }
        const activated: VersionResponse = await actR.json();
        dispatch({ type: 'MARK_CLEAN', activeVersionId: activated.id });
        await loadVersions();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setPublishError(msg);
        console.error('publishChanges:', e);
      } finally {
        setPublishing(false);
      }
    },
    [API, token, state.theme_config, state.tables, loadVersions],
  );

  // Rollback = ativar uma versão antiga. O backend desativa a atual e ativa a alvo
  // (partial-unique garante 1 ativa). Em sucesso re-hidrata o rascunho do editor
  // (reloadActive) e atualiza as flags is_active da lista.
  const rollbackTo = useCallback(
    async (id: number) => {
      if (!token) {
        setVersionError('Sem sessão ativa');
        return;
      }
      setVersionActionId(id);
      setVersionError(null);
      try {
        const r = await fetch(`${API}/api/publications/me/versions/${id}/activate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`activate ${r.status}: ${txt}`);
        }
        await reloadActive();
        await loadVersions();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setVersionError(msg);
        console.error('rollbackTo:', e);
      } finally {
        setVersionActionId(null);
      }
    },
    [API, token, reloadActive, loadVersions],
  );

  // Deleta versão inativa. O backend retorna 400 se for a ativa.
  const deleteVersion = useCallback(
    async (id: number) => {
      if (!token) {
        setVersionError('Sem sessão ativa');
        return;
      }
      setVersionActionId(id);
      setVersionError(null);
      try {
        const r = await fetch(`${API}/api/publications/me/versions/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`delete ${r.status}: ${txt}`);
        }
        await loadVersions();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setVersionError(msg);
        console.error('deleteVersion:', e);
      } finally {
        setVersionActionId(null);
      }
    },
    [API, token, loadVersions],
  );

  return (
    <PublishContext.Provider
      value={{
        state,
        dispatch,
        applyPreset,
        patch,
        loadingDraft,
        publishing,
        publishError,
        publishChanges,
        reloadActive,
        versions,
        loadingVersions,
        versionActionId,
        versionError,
        loadVersions,
        rollbackTo,
        deleteVersion,
      }}
    >
      {children}
    </PublishContext.Provider>
  );
}

export function usePublish() {
  const ctx = useContext(PublishContext);
  if (!ctx) throw new Error('usePublish must be used within a PublishProvider');
  return ctx;
}
