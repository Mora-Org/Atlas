'use client';

import React, { useState } from 'react';
import { usePublish } from '@/contexts/PublishContext';
import { AppearanceTab } from './AppearanceTab';
import { ContentTab } from './ContentTab';
import { PublishTab } from './PublishTab';
import { PublicSite } from './PublicSite';
import { ExportReview } from './ExportReview';
import { Button } from '@/components/ui';

export function PublishStudio() {
  const { state, dispatch, publishChanges } = usePublish();
  const [tab, setTab] = useState<'appearance' | 'content' | 'publish' | 'export'>('appearance');

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
      <header className="flex-none px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-gray-900 dark:text-gray-100">Publish Studio</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure and publish your public workspace.</p>
        </div>
        <div className="flex gap-4 items-center">
          {state.is_dirty && <span className="text-xs text-orange-600 dark:text-orange-400 font-mono tracking-widest uppercase">Unsaved changes</span>}
          <Button variant="ghost" onClick={() => setTab('export')}>Export...</Button>
          <Button onClick={publishChanges} disabled={!state.is_dirty}>Publish Changes</Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Controls */}
        <div className="w-96 flex-none flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex px-4 border-b border-gray-200 dark:border-gray-800 pt-2">
            {[
              { id: 'appearance', label: 'Appearance' },
              { id: 'content', label: 'Content' },
              { id: 'publish', label: 'Publish' },
            ].map(t => (
              <button 
                key={t.id} 
                onClick={() => setTab(t.id as any)}
                className={`px-4 py-3 text-xs font-mono tracking-widest uppercase border-b-2 transition-colors ${
                  tab === t.id 
                    ? 'border-indigo-500 text-indigo-700 dark:text-indigo-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'content' && <ContentTab />}
            {tab === 'publish' && <PublishTab />}
            {tab === 'export' && <ExportReview />}
          </div>
        </div>

        {/* Live Preview Area */}
        <div className="flex-1 bg-gray-200 dark:bg-gray-950 p-6 flex flex-col overflow-hidden relative">
          <div className="flex-none flex items-center justify-between mb-4">
            <span className="text-xs font-mono tracking-widest uppercase text-gray-500">Live Preview</span>
          </div>
          <div className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 overflow-y-auto shadow-2xl relative bg-white dark:bg-black">
            <PublicSite 
              themeConfig={state.theme_config}
              tables={state.tables}
              heroContent={state.hero_content}
              isEditable={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
