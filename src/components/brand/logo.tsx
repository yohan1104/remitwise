import { cn } from "@/lib/utils";

/**
 * RemitWise logomark — a wallet + upward growth arrow forming an "R".
 * This is a faithful vector rendition of the brand mark so the app ships
 * self-contained. To use the official raster logo instead, drop it in
 * /public/logo.png and swap this component for an <Image />.
 */
export function LogoMark({
  className,
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label="RemitWise"
      role="img"
    >
      <defs>
        <linearGradient id="rw-grad" x1="8" y1="8" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e3a8a" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id="rw-arrow" x1="20" y1="46" x2="52" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* rounded badge */}
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#rw-grad)" />
      {/* wallet body */}
      <rect x="13" y="24" width="26" height="20" rx="4" fill="#ffffff" fillOpacity="0.95" />
      <rect x="13" y="20" width="21" height="8" rx="3" fill="#ffffff" fillOpacity="0.55" />
      <circle cx="34" cy="34" r="2.6" fill="#1e3a8a" />
      {/* upward growth arrow / R stem */}
      <path
        d="M22 47c9 2 18-1 24-8l6-7"
        stroke="url(#rw-arrow)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M46 27l8-2 0 8"
        stroke="url(#rw-arrow)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({
  className,
  size = 34,
  showText = true,
  textClassName,
}: {
  className?: string;
  size?: number;
  showText?: boolean;
  textClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {showText && (
        <span
          className={cn(
            "text-xl font-bold tracking-tight leading-none",
            textClassName,
          )}
        >
          Remit<span className="text-gradient">Wise</span>
        </span>
      )}
    </span>
  );
}
