import React from 'react'

const ICON_PATHS = {
  // navigation
  home:         'M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z M9 21V12h6v9',
  menu:         'M3 6h18M3 12h18M3 18h18',
  close:        'M18 6L6 18M6 6l12 12',
  'arrow-left': 'M19 12H5M12 5l-7 7 7 7',
  'arrow-right':'M5 12h14M12 5l7 7-7 7',
  'arrow-up':   'M12 19V5M5 12l7-7 7 7',
  'arrow-down': 'M12 5v14M5 12l7 7 7-7',
  chevron_down: 'M6 9l6 6 6-6',
  chevron_up:   'M18 15l-6-6-6 6',
  chevron_left: 'M15 18l-6-6 6-6',
  chevron_right:'M9 18l6-6-6-6',
  // actions
  plus:         'M12 5v14M5 12h14',
  minus:        'M5 12h14',
  search:       'M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z',
  filter:       'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  sort:         'M3 6h18M7 12h10M11 18h2',
  edit:         'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  trash:        'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6',
  copy:         'M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2 M8 4a2 2 0 012-2h4a2 2 0 012 2v0H8V4z',
  download:     'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload:       'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  refresh:      'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  save:         'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z M17 21v-8H7v8M7 3v5h8',
  // data
  database:     'M12 2C6.48 2 2 4.24 2 7v10c0 2.76 4.48 5 10 5s10-2.24 10-5V7c0-2.76-4.48-5-10-5z M2 7c0 2.76 4.48 5 10 5s10-2.24 10-5 M2 12c0 2.76 4.48 5 10 5s10-2.24 10-5',
  table:        'M3 3h18v18H3V3z M3 9h18M3 15h18M9 3v18M15 3v18',
  columns:      'M12 3H3v18h9V3z M21 3h-9v18h9V3z',
  rows:         'M3 3h18v9H3V3z M3 12h18v9H3V12z',
  import:       'M16 16l-4 4-4-4M12 20V4 M4 4h16',
  // status
  check:        'M20 6L9 17l-5-5',
  'check-circle':'M22 11.08V12a10 10 0 11-5.93-9.14 M22 4L12 14.01l-3-3',
  'x-circle':   'M12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10z M15 9l-6 6M9 9l6 6',
  warning:      'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4M12 17h.01',
  info:         'M12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10z M12 16v-4M12 8h.01',
  // user / auth
  user:         'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z',
  users:        'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  shield:       'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  lock:         'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 0110 0v4',
  logout:       'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5M21 12H9',
  qr:           'M3 3h7v7H3V3z M14 3h7v7h-7V3z M3 14h7v7H3V14z M14 14h2v2h-2v-2z M18 14h2v2h-2v-2z M14 18h2v2h-2v-2z M18 18h2v2h-2v-2z M17 10V7h3M10 17v3H7M10 7v3',
  // layout
  layout:       'M3 3h18v18H3V3z M3 9h18M9 9v12',
  sidebar:      'M3 3h18v18H3V3z M9 3v18',
  grid:         'M3 3h8v8H3V3z M13 3h8v8h-8V3z M3 13h8v8H3V13z M13 13h8v8h-8V13z',
  list:         'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  // misc
  settings:     'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  bell:         'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  link:         'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71 M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  'external-link':'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3',
  folder:       'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  file:         'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6',
  palette:      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z M7.5 11.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M10.5 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M15.5 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M18.5 11.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  sun:          'M12 17a5 5 0 100-10 5 5 0 000 10z M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon:         'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
} as const

export type IconName = keyof typeof ICON_PATHS

interface IconProps {
  name: IconName
  size?: number
  color?: string
  sw?: number
  style?: React.CSSProperties
}

export default function Icon({ name, size = 16, color = 'currentColor', sw = 1.75, style }: IconProps) {
  const d = ICON_PATHS[name]
  if (!d) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {d.split(' M').map((segment, i) => (
        <path key={i} d={i === 0 ? segment : 'M' + segment} />
      ))}
    </svg>
  )
}
