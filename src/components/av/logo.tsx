// The AapatVani mark: a monogram, drawn as one geometric letterform.
//
// It reads two ways. It is an A, for the name. And the disc sitting in its counter is a place someone
// reported: solid, deliberate, and the only filled thing in the mark, which is what the whole product
// is about. The letterform is a stroked chevron with round terminals, so the mark is calm rather
// than urgent, and the disc floats clear of the strokes so it survives at favicon size, where a mark
// that touches its own counters turns to mush.
//
// Drawn with currentColor so one file serves the pale header and the dark rail without a second
// asset to keep in step.

export function Logo({ className, title = "AapatVani" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title} fill="none">
      <path
        d="M12 55 L32 13 L52 55"
        stroke="currentColor"
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="41" r="7.2" fill="currentColor" />
    </svg>
  );
}

/** The same mark as a wordmark lockup: the glyph, then the name. */
export function LogoLockup({ className, labelClassName }: { className?: string; labelClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <Logo className="size-7 shrink-0" />
      <span className={`text-lg font-bold tracking-tight ${labelClassName ?? ""}`}>AapatVani</span>
    </span>
  );
}
