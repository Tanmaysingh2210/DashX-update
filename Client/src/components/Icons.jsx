/**
 * Lightweight inline SVG icons — avoids pulling in an icon library.
 * All icons inherit color from currentColor and size from font-size/width props.
 */

export const FlameIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path
      d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.5-2-1-3 1.5 1 3 3.5 3 6.5A6 6 0 0 1 12 22a6 6 0 0 1-6-6c0-4 3-5 3-8 0-2-1-3-1-3 2 0 4 1 4 3z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const GitHubIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 .5C5.7.5.5 5.7.5 12c0 5 3.2 9.2 7.7 10.7.6.1.8-.2.8-.6v-2.2c-3.1.7-3.8-1.3-3.8-1.3-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.2-5.1-5.5 0-1.2.4-2.2 1.1-3-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.1 1.8 1.1 3 0 4.3-2.6 5.2-5.1 5.5.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6 4.5-1.5 7.7-5.7 7.7-10.7C23.5 5.7 18.3.5 12 .5z" />
  </svg>
);

export const LeetCodeIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TrendIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M3 17 9 11 13 15 21 7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TargetIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
);

export const CalendarIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
  </svg>
);

export const SparklesIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" strokeLinecap="round" />
  </svg>
);

export const ClockIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ZapIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M13 2 4 13h6l-1 9 9-11h-6l1-9z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CodeIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="m9 18-6-6 6-6M15 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const RefreshIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ArrowRightIcon = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PullRequestIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3H9" strokeLinecap="round" />
  </svg>
);

export const CommitIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M3 12h6M15 12h6" strokeLinecap="round" />
  </svg>
);