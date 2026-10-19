import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

const FEATURES = [
  {
    title: "Drag & drop kanban",
    body: "Move tasks across columns in real time — native HTML5 DnD, zero extra dependencies.",
  },
  {
    title: "JWT auth done right",
    body: "bcrypt-hashed passwords, httpOnly cookies, 7-day sessions and zero user enumeration.",
  },
  {
    title: "Type-safe REST API",
    body: "Next.js route handlers + Prisma with ownership checks on every board, column and task.",
  },
  {
    title: "Production-ready",
    body: "Docker image with multi-stage build, PostgreSQL or SQLite — deploys in one command.",
  },
  {
    title: "Tested & typed",
    body: "Strict TypeScript across the stack and Vitest covering auth primitives and API validation.",
  },
  {
    title: "Clean architecture",
    body: "lib / api / components layers, shared types, no business logic inside React components.",
  },
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
      </main>

      <footer className="site-footer">
        {APP_NAME} — MIT License
      </footer>
    </>
  );
}
