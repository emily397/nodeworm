// Inline icon set standing in for the prototype's Phosphor CDN link, so the
// page keeps zero external requests. Same glyph language: 24x24, round caps.

type P = { size?: number; color?: string };

function Svg({ size = 28, color = "currentColor", children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const Lightning = (p: P) => (
  <Svg {...p}>
    <path d="M13.5 2.5 4.5 13.5h6l-1 8 9-11h-6z" />
  </Svg>
);

export const Globe = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M2.8 12h18.4M12 2.8c2.4 2.6 3.6 5.8 3.6 9.2s-1.2 6.6-3.6 9.2c-2.4-2.6-3.6-5.8-3.6-9.2s1.2-6.6 3.6-9.2z" />
  </Svg>
);

export const Refresh = (p: P) => (
  <Svg {...p}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
    <path d="M20.8 3.6v5h-5" />
  </Svg>
);

export const Check = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12.6 9.5 17.5 19.5 6.8" />
  </Svg>
);

export const Search = (p: P) => (
  <Svg {...p}>
    <circle cx="10.6" cy="10.6" r="7" />
    <path d="M15.8 15.8 21 21" />
  </Svg>
);

export const Compass = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9.2" />
    <path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1z" />
  </Svg>
);

export const Plugs = (p: P) => (
  <Svg {...p}>
    <path d="m8.5 15.5-4 4M15.5 8.5l4-4" />
    <path d="M10.8 6.6 17.4 13.2a2.5 2.5 0 0 1 0 3.5l-1.2 1.2a2.5 2.5 0 0 1-3.5 0L6.1 11.3a2.5 2.5 0 0 1 0-3.5l1.2-1.2a2.5 2.5 0 0 1 3.5 0z" />
  </Svg>
);

export const Shield = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.8 4.5 6v6c0 4.6 3.1 7.9 7.5 9.2 4.4-1.3 7.5-4.6 7.5-9.2V6z" />
    <path d="m8.8 12 2.3 2.3 4.1-4.6" />
  </Svg>
);

export const Plane = (p: P) => (
  <Svg {...p}>
    <path d="M21 3 10.5 13.5" />
    <path d="M21 3 14.4 21l-3.9-7.5L3 9.6z" />
  </Svg>
);
