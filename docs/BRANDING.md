# Rebranding guide

DevFlow is white-label: you can ship it under your own name and colours
**without touching the application code**.

---

## 1. Name, tagline, description

Set three public environment variables (in `.env`, `.env.local` or your host's
dashboard):

```bash
NEXT_PUBLIC_APP_NAME="Boardly"
NEXT_PUBLIC_APP_TAGLINE="Ship work faster with a clean kanban."
NEXT_PUBLIC_APP_DESCRIPTION="A self-hosted kanban for small teams."
```

They drive:

- the header logo (first 3 characters solid, the rest gradient)
- the browser tab title (`{name} — Kanban for dev teams`)
- the landing hero subtitle
- the meta description used by search engines and link previews

Restart the dev server (`npm run dev`) after changing them.

---

## 2. Colours & design tokens

Everything visual lives in `src/app/globals.css`, in a single `:root` block:

```css
:root {
  --bg: #0b0e14;          /* app background */
  --surface: #11151f;     /* cards, columns */
  --surface-2: #171c29;   /* inputs, task cards */
  --border: #232a3b;      /* hairlines */
  --text: #e6e9f0;        /* primary text */
  --muted: #8b93a7;       /* secondary text */
  --accent: #6366f1;      /* brand colour 1 (buttons, focus) */
  --accent-2: #22d3ee;    /* brand colour 2 (gradients) */
  --danger: #f43f5e;
  --warning: #f59e0b;
  --success: #10b981;
  --radius: 10px;
}
```

Change `--accent` and `--accent-2` and the whole app (buttons, badges, hero
gradient, focus rings) follows. There is no Tailwind or CSS framework to fight
with — no config file, no build step.

### Light theme

Append this block to `globals.css` to offer a light skin:

```css
:root[data-theme="light"] {
  --bg: #f7f8fb;
  --surface: #ffffff;
  --surface-2: #f1f3f9;
  --border: #e2e6f0;
  --text: #12151f;
  --muted: #5b6478;
}
```

---

## 3. Logo / favicon

- Favicon: replace `src/app/favicon.ico` (or add `src/app/icon.svg`).
- The header logo is text-based (`APP_NAME`), styled by `.logo` in
  `globals.css`. To use an image instead, swap the markup in
  `src/app/page.tsx` and `src/components/Board.tsx`.

---

## 4. Meta & social

Edit `src/app/layout.tsx`:

```ts
export const metadata: Metadata = {
  title: { default: `${APP_NAME} — Kanban for dev teams`, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
};
```

Add `metadataBase`, `openGraph` and `icons` there for link previews.

---

## 5. Copy & emails

- Landing copy: `src/app/page.tsx` (`FEATURES` array + hero).
- Auth screens: `src/components/AuthForm.tsx`.
- Seed data / demo account: `prisma/seed.ts`.

---

## 6. What you usually add next

| Feature | Where to start |
| --- | --- |
| Email verification / password reset | `src/app/api/auth/*` + a mail provider (Resend, Postmark) |
| Team workspaces & roles | `prisma/schema.prisma` (add a `Workspace` model) |
| File attachments | Vercel Blob or S3 + a `TaskAttachment` model |
| Board sharing / public boards | add a `visibility` field to `Board` |
| Activity log | new `Activity` model + entries in the task routes |
| Stripe subscriptions | new `Subscription` model + a `/api/billing/checkout` route |

Each of them is a contained addition: the data layer is Prisma, the API is one
route file per resource, and the UI is isolated in `src/components/`.
