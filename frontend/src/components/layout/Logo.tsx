import { Link } from "react-router-dom";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" data-testid="logo-link" aria-label="WasteNot home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#2E3D28" />
        <path d="M9 22c0-7 4.5-11.5 13-12-.5 8-5 12.5-12 12.5" fill="#A9B887" />
        <path d="M9.5 23c2.5-4.5 6-7.5 10-10" stroke="#F7F4EC" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[22px] font-medium tracking-tight text-olive">WasteNot</span>
    </Link>
  );
}
