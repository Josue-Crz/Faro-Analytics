interface LighthouseMarkProps {
  className?: string;
  size?: number;
  title?: string;
}

export function LighthouseMark({
  className,
  size = 28,
  title = 'Faro Analytics lighthouse',
}: LighthouseMarkProps) {
  return (
    <svg
      aria-label={title}
      className={className}
      height={size}
      role="img"
      viewBox="0 0 100 100"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 27h31m34 0h31"
        fill="none"
        stroke="var(--faro-signal, #08bdba)"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path d="m39 23 11-11 11 11v14H39z" fill="#0f62fe" />
      <circle cx="50" cy="27" fill="currentColor" r="6" />
      <path
        d="M36 41h28l10 48H26z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="6"
      />
      <path
        d="M22 90h56M32 67h36M35 52h30"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="6"
      />
    </svg>
  );
}
