import Link from "next/link";

export function Header() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" href="/" aria-label="TraceRCA operations dashboard">
          <span className="brand-mark">TR</span>
          <span className="brand-copy">
            <strong>TraceRCA</strong>
            <span>Incident intelligence</span>
          </span>
        </Link>
        <nav className="topnav" aria-label="Primary navigation">
          <Link href="/">Operations</Link>
          <a href="/#incidents">Incidents</a>
          <a href="/#replays">Replays</a>
        </nav>
        <span className="header-context">LIVE EVIDENCE CONSOLE</span>
      </div>
    </header>
  );
}
