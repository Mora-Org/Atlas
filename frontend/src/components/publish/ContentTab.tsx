'use client';

import React from 'react';
import { usePublish, TableSelection, LayoutType } from '@/contexts/PublishContext';

export function ContentTab() {
  const { state, dispatch } = usePublish();

  const addTable = () => {
    const newTable: TableSelection = {
      table_id: `table_${Date.now()}`,
      order: state.tables.length,
      layout: 'list'
    };
    dispatch({ type: 'SET_TABLES', payload: [...state.tables, newTable] });
  };

  const updateTable = (index: number, layout: LayoutType) => {
    const newTables = [...state.tables];
    newTables[index].layout = layout;
    dispatch({ type: 'SET_TABLES', payload: newTables });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Curate tables to display on the public site. (Placeholder for Table Selection UI)
      </div>
      
      {state.tables.map((t, idx) => (
        <div key={t.table_id} className="p-4 border rounded bg-white dark:bg-gray-800 dark:border-gray-700">
          <div className="text-sm font-bold">{t.table_id}</div>
          <select 
            value={t.layout} 
            onChange={(e) => updateTable(idx, e.target.value as LayoutType)}
            className="mt-2 text-sm border p-1 rounded"
          >
            <option value="list">List</option>
            <option value="grid">Grid</option>
            <option value="essay">Essay</option>
          </select>
        </div>
      ))}

      <button onClick={addTable} className="p-2 border border-dashed border-gray-400 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">
        + Add Table
      </button>
    </div>
  );
}
