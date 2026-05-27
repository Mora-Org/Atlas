'use client';

import React, { createContext, useContext, useReducer, useEffect } from 'react';

export type Density = 'compact' | 'regular' | 'comfy';
export type LayoutType = 'list' | 'grid' | 'essay';

export interface ThemeConfig {
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  rule: string;
  radius: number;
  density: Density;
  headerSize: number;
  italicHeadlines: boolean;
}

export interface TableSelection {
  table_id: string;
  order: number;
  layout: LayoutType;
}

export interface HeroContent {
  eyebrow: string;
  title: string;
  subtitle: string;
}

export interface PublishDraftState {
  theme_config: ThemeConfig;
  tables: TableSelection[];
  hero_content: HeroContent;
  is_dirty: boolean;
  active_version_id: string | null;
}

type PublishAction =
  | { type: 'SET_THEME_CONFIG'; payload: Partial<ThemeConfig> }
  | { type: 'SET_TABLES'; payload: TableSelection[] }
  | { type: 'SET_HERO_CONTENT'; payload: Partial<HeroContent> }
  | { type: 'LOAD_DRAFT'; payload: Partial<PublishDraftState> }
  | { type: 'MARK_CLEAN' };

const INITIAL_THEME: ThemeConfig = {
  fontDisplay: "'Fraunces', Georgia, serif",
  fontBody: "'IBM Plex Serif', Georgia, serif",
  fontMono: "'IBM Plex Mono', monospace",
  bg: "#FAEFD9",
  surface: "#FFFCF3",
  ink: "#212842",
  muted: "#4A5468",
  accent: "#C2441C",
  rule: "#212842",
  radius: 4,
  density: "comfy",
  headerSize: 88,
  italicHeadlines: true,
};

const initialState: PublishDraftState = {
  theme_config: INITIAL_THEME,
  tables: [],
  hero_content: {
    eyebrow: "Publicação Oficial",
    title: "A vitrine do seu acervo",
    subtitle: "Bem-vindo ao portal."
  },
  is_dirty: false,
  active_version_id: null,
};

function publishReducer(state: PublishDraftState, action: PublishAction): PublishDraftState {
  switch (action.type) {
    case 'SET_THEME_CONFIG':
      return {
        ...state,
        theme_config: { ...state.theme_config, ...action.payload },
        is_dirty: true,
      };
    case 'SET_TABLES':
      return {
        ...state,
        tables: action.payload,
        is_dirty: true,
      };
    case 'SET_HERO_CONTENT':
      return {
        ...state,
        hero_content: { ...state.hero_content, ...action.payload },
        is_dirty: true,
      };
    case 'LOAD_DRAFT':
      return {
        ...state,
        ...action.payload,
        is_dirty: false,
      };
    case 'MARK_CLEAN':
      return {
        ...state,
        is_dirty: false,
      };
    default:
      return state;
  }
}

interface PublishContextProps {
  state: PublishDraftState;
  dispatch: React.Dispatch<PublishAction>;
  publishChanges: () => Promise<void>;
}

const PublishContext = createContext<PublishContextProps | undefined>(undefined);

export function PublishProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(publishReducer, initialState);

  // Here we would implement the load draft from backend logic
  useEffect(() => {
    // Mocking a load from backend
    // fetch('/api/publications/me/versions/active')...
  }, []);

  const publishChanges = async () => {
    // API call goes here
    console.log("Publishing...", state);
    // Simulate successful publish
    setTimeout(() => {
      dispatch({ type: 'MARK_CLEAN' });
    }, 1000);
  };

  return (
    <PublishContext.Provider value={{ state, dispatch, publishChanges }}>
      {children}
    </PublishContext.Provider>
  );
}

export function usePublish() {
  const context = useContext(PublishContext);
  if (!context) {
    throw new Error('usePublish must be used within a PublishProvider');
  }
  return context;
}
