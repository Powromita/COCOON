type Props = { className?: string };

/** COCOON hex-cell icon, redrawn from the Stitch lockup so it scales cleanly next to the wordmark. */
export default function BrandMark({ className = "w-8 h-8" }: Props) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="#FFFFFF" stroke="#1E3A8A" strokeWidth="3" />
      <path d="M16 7.5 23.4 11.75v8.5L16 24.5 8.6 20.25v-8.5Z" fill="#ECFBFC" stroke="#0F7A8C" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="3.2" fill="#D97706" />
    </svg>
  );
}
