interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** Külső ikonkönyvtár nélküli, könnyű SVG ikonkészlet (stroke alapú, Fluent-szerű). */
const PATHS: Record<string, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  broom: 'M19 3l-5 5M14 8l-6 6M8 14l-4 4 2 2 4-4M8 14l2 2M10 16l4-4M4 20l-1 1',
  rocket: 'M12 2c3 2 5 6 5 10l-3 3H10l-3-3c0-4 2-8 5-10zM9 18l-2 4M15 18l2 4M12 11h.01',
  gauge: 'M12 21a9 9 0 1 1 9-9M12 12l5-3',
  wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  tools: 'M14.7 6.3a4 4 0 0 0 5 5L21 21H3l9.3-9.3a4 4 0 0 1 2.4-5.4z',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  cpu: 'M6 6h12v12H6zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4',
  memory: 'M4 7h16v10H4zM8 17v3M12 17v3M16 17v3M8 11h.01M12 11h.01M16 11h.01',
  disk: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  gpu: 'M2 7h20v10H2zM6 11h4M14 11h4M6 14h2',
  network: 'M12 21v-6M5 9V5h14v4M5 9l7 6 7-6M3 21h4M17 21h4',
  windows: 'M3 5.5l8-1.2v7.2H3zM13 4l8-1.2v8.7h-8zM3 12.5h8v7.2l-8-1.2zM13 12.5h8v8.7L13 20z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  check: 'M4 12.5l5 5L20 6.5',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 3l9 16H3zM12 9v5M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  play: 'M7 4l12 8-12 8z',
  undo: 'M9 14l-5-5 5-5M4 9h9a6 6 0 0 1 0 12H8',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  terminal: 'M5 6l5 6-5 6M12 18h7',
  'terminal-square': 'M3 4h18v16H3zM7 9l3 3-3 3M13 15h4',
  server: 'M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  database: 'M12 8c5 0 9-1.1 9-2.5S17 3 12 3 3 4.1 3 5.5 7 8 12 8zM3 5.5v13C3 19.9 7 21 12 21s9-1.1 9-2.5v-13M3 12c0 1.4 4 2.5 9 2.5s9-1.1 9-2.5',
  disc: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  folder: 'M3 6h6l2 3h10v10H3z',
  file: 'M14 3H6v18h12V7z M14 3v4h4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  chevron: 'M9 6l6 6-6 6',
  external: 'M15 3h6v6M10 14L21 3M18 13v8H3V6h8',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 15h8v6H8z',
  power: 'M12 3v9M6.5 6.5a8 8 0 1 0 11 0',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className, strokeWidth = 1.7 }: IconProps) {
  const d = PATHS[name] ?? PATHS.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
