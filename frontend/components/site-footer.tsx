const CREDITS = [
  { label: "Jolpica", href: "https://github.com/jolpica/jolpica-f1" },
  { label: "OpenF1", href: "https://openf1.org" },
  { label: "FastF1", href: "https://github.com/theOehrly/Fast-F1" },
  { label: "CC BY-NC-SA 4.0", href: "https://creativecommons.org/licenses/by-nc-sa/4.0/" },
] as const;

/** Disclaimer and data credits, required by the sources' licenses. */
export function SiteFooter() {
  return (
    <footer className="border-t border-f1-grid px-6 py-4 text-[11px] leading-relaxed text-f1-muted md:px-8">
      <p>
        Unofficial fan project. Not affiliated with Formula 1, the FIA or Formula One
        Management. F1 and related marks are trademarks of Formula One Licensing B.V.
      </p>
      <p className="mt-1">
        Race data from Jolpica, OpenF1 and FastF1, used non-commercially under CC
        BY-NC-SA 4.0. Circuit maps by julesr0y (CC BY 4.0). Driver photos © Formula 1.
      </p>
      <nav aria-label="Data sources" className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {CREDITS.map(({ label, href }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-f1-grid underline-offset-2 transition-colors duration-150 hover:text-f1-text"
          >
            {label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
