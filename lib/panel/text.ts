export const PCO = { text: '61310', muted: '40345', amber: '62893' } as const;

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
