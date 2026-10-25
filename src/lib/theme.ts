// Design tokens ported from the web app's CSS variables.
export const C = {
  bg: '#EEF1F8',
  bg2: '#E3E9F7',
  blob1: '#B9C6FF',
  blob2: '#FFD9E8',
  blob3: '#C9F3E6',
  ink: '#14161F',
  soft: '#4B4F5E',
  faint: '#8A8FA0',
  glass: 'rgba(255,255,255,0.72)',
  glassStrong: 'rgba(255,255,255,0.9)',
  glassBorder: 'rgba(255,255,255,0.85)',
  line: 'rgba(20,22,31,0.08)',
  primary: '#3E6BFF',
  primary2: '#7A5CFA',
  danger: '#FF4757',
  success: '#14C48B',
  warning: '#FF9F43',
} as const;

export const STATUS_COLOR: Record<string, string> = {
  draft: '#8A8FA0',
  sent: '#3E6BFF',
  signed: '#7A5CFA',
  active: '#14C48B',
  completed: '#14161F',
  cancelled: '#FF4757',
};

export const R = { lg: 26, md: 18, sm: 12 } as const;

export const SHADOW = {
  shadowColor: '#1F2850',
  shadowOpacity: 0.1,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;
