import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

const FEATURES = [
  {
    title: "Drag & drop kanban",
    body: "Move tasks across columns — native HTML5 DnD plus keyboard-accessible modal controls (select a column, move up/down).",
  },
  {
    title: "JWT auth done right",
    body: "bcrypt-hashed passwords, httpOnly cookies, 7-day sessions, same-message login errors (timing-equalised).",
  },
  {
    title: "Type-safe REST API",
    body: "Next.js route handlers + Prisma with ownership checks on every board, column and task.",
  },
  {
    title: "Production-ready",
    body: "Multi-stage Docker image, non-root, migrations applied on startup via `prisma migrate deploy` — one command after `.env` setup.",
  },
  {
    title: "Tested & typed",
    body: "TypeScript strict everywhere and Vitest suites — unit, auth/rate-limit, real-DB integration (SQLite) and route-level tests.",
  },
  {
    title: "Clean architecture",
    body: "lib / api / components layers, shared types, no business logic inside React components.",
  },
];

const TIERS = [
  { name: "Personal", price: "€39", href: "https://allaoui67.gumroad.com/l/fyimeh", blurb: "Learning & portfolio (non-commercial)" },
  { name: "Commercial", price: "€99", href: "https://allaoui67.gumroad.com/l/jempqs", blurb: "Client & commercial work (SaaS OK)" },
  { name: "Studio", price: "€199", href: "https://allaoui67.gumroad.com/l/edecsm", blurb: "Unlimited clients + resale rights" },
  { name: "Agency", price: "€349", href: "https://allaoui67.gumroad.com/l/inimos", blurb: "Agency-wide + resale + priority support" },
];

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="logo">
          {APP_NAME.slice(0, 3)}
          <span>{APP_NAME.slice(3)}</span>
        </div>
        <nav style={{ display: "flex", gap: "0.5rem" }}>
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
          <Link href="/register" className="btn btn-primary">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <h1>
            Ship faster with a <em>kanban</em> built for dev teams
          </h1>
          <p>{APP_TAGLINE}</p>
          <div className="hero-actions">
            <Link href="/register" className="btn btn-primary">
              Create your board →
            </Link>
            <Link href="/login" className="btn">
              I already have an account
            </Link>
          </div>
        </section>

        <section className="features">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </section>

        <section className="pricing" aria-label="Pricing">
          <h2>One-time payment. Yours forever.</h2>
          <div className="pricing-grid">
            {TIERS.map((t) => (
              <article key={t.name} className="feature pricing-card">
                <h3>{t.name}</h3>
                <div className="price">{t.price}</div>
                <p>{t.blurb}</p>
                <a
                  className="btn btn-primary"
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buy on Gumroad
                </a>
              </article>
            ))}
          </div>
          <p className="sub">
            Try the demo first —{" "}
            <Link href="/login">
              <code>demo@devflow.app / devflow123</code>
            </Link>
          </p>
        </section>
      </main>

      <footer className="site-footer">
        {APP_NAME} — MIT License
      </footer>
    </>
  );
}
