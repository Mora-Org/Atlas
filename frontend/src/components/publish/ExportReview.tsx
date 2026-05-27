'use client';

import React from 'react';

export function ExportReview() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-serif">Export Packages</h2>
      <p className="text-sm text-gray-600">Select the packages you want to export.</p>
      
      <div className="flex flex-col gap-4">
        <label className="flex items-start gap-3 p-4 border rounded cursor-pointer hover:bg-gray-50">
          <input type="checkbox" className="mt-1" defaultChecked />
          <div>
            <div className="font-bold">Static Site (Frontend)</div>
            <div className="text-sm text-gray-500">HTML/CSS/JS ready to be hosted on Vercel, Netlify, or any static host.</div>
          </div>
        </label>
        
        <label className="flex items-start gap-3 p-4 border rounded cursor-pointer hover:bg-gray-50">
          <input type="checkbox" className="mt-1" defaultChecked />
          <div>
            <div className="font-bold">Database (SQLite)</div>
            <div className="text-sm text-gray-500">A .sqlite file containing all your curated data.</div>
          </div>
        </label>
      </div>

      <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 w-fit">
        Generate ZIP
      </button>
    </div>
  );
}
