'use client';

import React from 'react';
import { usePublish, Density } from '@/contexts/PublishContext';

export function AppearanceTab() {
  const { state, dispatch } = usePublish();
  const theme = state.theme_config;

  const update = (patch: any) => {
    dispatch({ type: 'SET_THEME_CONFIG', payload: patch });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-3">Header Size: {theme.headerSize}px</h3>
        <input 
          type="range" 
          min="40" 
          max="120" 
          value={theme.headerSize}
          onChange={e => update({ headerSize: parseInt(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <h3 className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-3">Colors</h3>
        <div className="flex flex-col gap-2">
          {[
            { key: 'bg', label: 'Background' },
            { key: 'surface', label: 'Surface' },
            { key: 'ink', label: 'Text' },
            { key: 'accent', label: 'Accent' },
          ].map(c => (
            <div key={c.key} className="flex items-center gap-3">
              <input 
                type="color" 
                value={(theme as any)[c.key]}
                onChange={e => update({ [c.key]: e.target.value })}
                className="w-8 h-8 rounded border border-gray-300"
              />
              <span className="text-sm flex-1">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-3">Density</h3>
        <div className="grid grid-cols-3 gap-2">
          {['compact', 'regular', 'comfy'].map(d => (
            <button 
              key={d}
              onClick={() => update({ density: d as Density })}
              className={`p-2 text-sm rounded border ${theme.density === d ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input 
            type="checkbox" 
            checked={theme.italicHeadlines}
            onChange={e => update({ italicHeadlines: e.target.checked })}
          />
          <span className="text-sm">Italic Headlines</span>
        </label>
      </div>
    </div>
  );
}
