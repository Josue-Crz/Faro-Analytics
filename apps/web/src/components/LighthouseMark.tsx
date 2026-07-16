interface LighthouseMarkProps {
  className?: string;
  size?: number;
  title?: string;
}

export function LighthouseMark({
  className,
  size = 28,
  title = 'Faro lighthouse',
}: LighthouseMarkProps) {
  return (
    <svg
      aria-label={title}
      className={className}
      height={size}
      role="img"
      viewBox="0 0 32 32"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M2 8.5h9v2H2z" fill="currentColor" opacity=".38" />
      <path d="M21 8.5h9v2h-9z" fill="currentColor" opacity=".38" />
      <path d="m13 7 3-3 3 3v4h-6z" fill="currentColor" />
      <path d="M11.5 12.5h9L23 29H9z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 29h16M12 20h8M13 15h6" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="9" fill="var(--faro-signal, #08bdba)" r="1.5" />
    </svg>
  );
}
