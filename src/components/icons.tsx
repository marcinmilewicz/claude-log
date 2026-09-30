import type { ReactNode } from 'react';

// Stroke icons on a 24×24 grid; they inherit color from the surrounding text.
function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const icons = {
  overview: (
    <Icon>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 3 3 5-6" />
    </Icon>
  ),
  money: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3 6 1.7 6 4.7 0 1.3-1.3 2.5-3 2.5s-3-1.1-3-2.5M12 5.5v1.5M12 17v1.5" />
    </Icon>
  ),
  prompt: (
    <Icon>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8M8 13h5" />
    </Icon>
  ),
  sessions: (
    <Icon>
      <path d="m12 2 10 5-10 5L2 7z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </Icon>
  ),
  context: (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 10v10" />
    </Icon>
  ),
  tools: (
    <Icon>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Icon>
  ),
  skills: (
    <Icon>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 16v4M17 18h4" />
    </Icon>
  ),
  activity: (
    <Icon>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Icon>
  ),
  friction: (
    <Icon>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  ),
  upload: (
    <Icon size={28}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5M12 3v12" />
    </Icon>
  ),
  file: (
    <Icon size={16}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </Icon>
  ),
  lock: (
    <Icon size={15}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icon>
  ),
  bolt: (
    <Icon size={15}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </Icon>
  ),
  chart: (
    <Icon size={15}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Icon>
  ),
  sun: (
    <Icon size={16}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  ),
  moon: (
    <Icon size={16}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </Icon>
  ),
  copy: (
    <Icon size={15}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Icon>
  ),
  check: (
    <Icon size={15}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  ),
};

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--series-2)" />
          <stop offset="1" stopColor="var(--series-1)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo-grad)" />
      <rect x="8" y="16" width="4" height="8" rx="1.5" fill="#fff" opacity="0.75" />
      <rect x="14" y="11" width="4" height="13" rx="1.5" fill="#fff" opacity="0.9" />
      <rect x="20" y="7" width="4" height="17" rx="1.5" fill="#fff" />
    </svg>
  );
}

export function LinkedInIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#0a66c2" />
      <circle cx="7" cy="7.2" r="1.7" fill="#fff" />
      <rect x="5.5" y="10" width="3" height="8.5" rx="0.5" fill="#fff" />
      <path d="M10.5 10h2.8v1.3c.5-.9 1.6-1.5 2.9-1.5 2.3 0 3.3 1.4 3.3 3.9v4.8h-3v-4.2c0-1.1-.3-1.9-1.4-1.9-1.1 0-1.6.8-1.6 1.9v4.2h-3z" fill="#fff" />
    </svg>
  );
}
