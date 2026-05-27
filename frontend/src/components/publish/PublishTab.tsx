'use client';

import React from 'react';
import { usePublish } from '@/contexts/PublishContext';

export function PublishTab() {
  const { state, publishChanges } = usePublish();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-3">Status</h3>
        <div className="p-4 rounded border border-gray-200 bg-white">
          <div className="font-bold">Active Version: {state.active_version_id || 'None'}</div>
          <div className="text-sm text-gray-500 mt-1">Changes pending: {state.is_dirty ? 'Yes' : 'No'}</div>
        </div>
      </div>

      <button 
        onClick={publishChanges} 
        disabled={!state.is_dirty}
        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        Publish Current Draft
      </button>

      <div>
        <h3 className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-3">History (Coming soon)</h3>
        <div className="text-sm text-gray-500">
          Rollback to previous versions will be available here.
        </div>
      </div>
    </div>
  );
}
