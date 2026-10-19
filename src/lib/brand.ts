/**
 * White-label configuration.
 * Change APP_NAME / APP_TAGLINE in `.env` to rebrand the whole app
 * (header, page title, landing copy) without touching the code.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "DevFlow";

export const APP_TAGLINE =
  process.env.NEXT_PUBLIC_APP_TAGLINE ??
  "Full-stack kanban SaaS — plan it, drag it, ship it.";

export const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
  "A clean, production-ready kanban: REST API, JWT auth, drag & drop, Docker, CI.";
