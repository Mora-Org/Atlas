'use client';

import React from 'react';
import { ThemeConfig, TableSelection, HeroContent, usePublish } from '@/contexts/PublishContext';

interface PublicSiteProps {
  themeConfig: ThemeConfig;
  tables: TableSelection[];
  heroContent: HeroContent;
  isEditable?: boolean;
}

export function PublicSite({ themeConfig, tables, heroContent, isEditable }: PublicSiteProps) {
  const { dispatch } = isEditable ? usePublish() : { dispatch: undefined };

  const handleHeroChange = (field: keyof HeroContent, value: string) => {
    if (dispatch) {
      dispatch({ type: 'SET_HERO_CONTENT', payload: { [field]: value } });
    }
  };

  const heroPad = themeConfig.density === "comfy" ? "72px 56px 56px" : themeConfig.density === "regular" ? "56px 56px 40px" : "40px 56px 28px";

  return (
    <div 
      className="w-full h-full overflow-y-auto"
      style={{
        backgroundColor: themeConfig.bg,
        color: themeConfig.ink,
        fontFamily: themeConfig.fontBody,
      }}
    >
      <header 
        style={{
          padding: "16px 56px", 
          borderBottom: `1px solid ${themeConfig.rule}33`,
          backgroundColor: themeConfig.bg,
        }}
        className="flex items-center justify-between sticky top-0 z-10"
      >
        <span style={{
          fontFamily: themeConfig.fontDisplay, 
          fontSize: 22,
          fontStyle: themeConfig.italicHeadlines ? "italic" : "normal",
        }}>Workspace Name</span>
      </header>

      <section style={{ padding: heroPad, borderBottom: `2px solid ${themeConfig.ink}` }}>
        <div style={{
          fontFamily: themeConfig.fontMono, 
          fontSize: 11, 
          letterSpacing: "0.2em",
          color: themeConfig.accent, 
          marginBottom: 18,
          textTransform: "uppercase"
        }}>
          {isEditable ? (
            <input 
              value={heroContent.eyebrow}
              onChange={e => handleHeroChange('eyebrow', e.target.value)}
              className="bg-transparent outline-none w-full"
            />
          ) : heroContent.eyebrow}
        </div>

        <div style={{
          fontFamily: themeConfig.fontDisplay, 
          fontSize: themeConfig.headerSize,
          fontStyle: themeConfig.italicHeadlines ? "italic" : "normal",
          lineHeight: 0.95,
          color: themeConfig.ink,
          maxWidth: 900,
        }}>
          {isEditable ? (
            <input 
              value={heroContent.title}
              onChange={e => handleHeroChange('title', e.target.value)}
              className="bg-transparent outline-none w-full font-inherit"
            />
          ) : heroContent.title}
        </div>

        <div style={{
          fontSize: 18, 
          color: themeConfig.muted, 
          maxWidth: 580,
          margin: "24px 0 0", 
          lineHeight: 1.5,
        }}>
          {isEditable ? (
            <textarea 
              value={heroContent.subtitle}
              onChange={e => handleHeroChange('subtitle', e.target.value)}
              className="bg-transparent outline-none w-full resize-none"
              rows={2}
            />
          ) : heroContent.subtitle}
        </div>
      </section>

      <section style={{ padding: "40px 56px" }}>
        <div className="text-sm opacity-50 mb-4">
          Tables Content Preview ({tables.length} tables selected)
        </div>
        {tables.map(t => (
          <div key={t.table_id} className="p-4 mb-4 border border-current rounded" style={{ borderColor: themeConfig.rule }}>
            {t.table_id} - Layout: {t.layout}
          </div>
        ))}
      </section>
    </div>
  );
}
