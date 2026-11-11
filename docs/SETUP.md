# Setup guide

Everything you need to run **DevFlow** locally, in Docker, or on a production host.

---

## 1. Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20+ (22 recommended) | `node -v` |
| npm | 10+ | bundled with Node |
| Docker | optional | only for the Postgres / containerised setup |
| Postgres | optional | SQLite works out of the box |

---

## 2. Local development (SQLite — zero setup)

```bash
npm install
cp .env.example .env        # SQLite URL + a JWT secret are already filled in
npm run setup               # prisma generate + db push + demo seed
npm run dev                 # → http://localhost:3000
```

`npm run setup` creates the SQLite database, applies the schema and seeds a demo
account:

```
demo@devflow.app / devflow123
```

Skip the seed if you prefer an empty install:

```bash
npx prisma generate
npx prisma db push
npm run dev
```

---

## 3. PostgreSQL (local or hosted)

Keep the **Postgres** schema (`prisma/schema.postgres.prisma`) — the default
`prisma/schema.prisma` is SQLite-only. Apply the migration:

```bash
DATABASE_URL="postgresql://user:password@host:5432/devflow" \
  npx prisma migrate deploy --schema prisma/schema.postgres.prisma
npm run dev
```

For a hosted database (Neon, Supabase, Railway…) the same applies — use the
pooled URL for the app runtime, and the unpooled URL for migrations.

> Already created a database with `prisma db push`? Mark the baseline as
> applied once so `migrate deploy` won't try to recreate the tables:
>
> ```bash
> npx prisma migrate resolve --applied 20261107163000_init \
>   --schema prisma/schema.postgres.prisma
> ```

---

## 4. Docker

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and JWT_SECRET (both are required,
# docker compose refuses to start without them)
docker compose up --build   # → http://localhost:3000
```

Notes:

- `docker-compose.yml` ships the app + a Postgres service; Postgres is **not**
  published on the host — it is reachable only inside the compose network.
- The `DATABASE_URL` in `.env` is ignored for the app container (compose sets it
  explicitly), but `.env` is mandatory — compose fails if it is missing.
- `POSTGRES_PASSWORD` is interpolated raw into `DATABASE_URL`, so avoid `@`, `:`,
  `/`, `#`, `%` in the password (or URL-encode them).

---

## 5. Production build

```bash
npm run build
npm start                     # → http://localhost:3000
```

Set these environment variables in production:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (**required**) |
| `JWT_SECRET` | long random string, e.g. `openssl rand -base64 32` |
| `COOKIE_SECURE` | `true` when served over HTTPS (default in production) |
| `TRUST_PROXY` | `true` when behind a reverse proxy / Vercel (enables per-IP limits) |
| `NEXT_PUBLIC_APP_NAME` | optional — white-label the app name |

---

## 6. Deploy on Vercel

```bash
vercel link --project your-project
vercel --prod
```

For a hosted database, add the Neon (or any Postgres) integration in the
Vercel dashboard, then apply the schema with the production schema:

```bash
DATABASE_URL="..." npx prisma migrate deploy --schema prisma/schema.postgres.prisma
```

(The Vercel build runs `build:vercel` = `prisma generate --schema
prisma/schema.postgres.prisma && next build`, see `vercel.json`.)

---

## 7. Tests & quality

```bash
npm test          # Vitest (auth, rate limiting, validation, integration)
npm run typecheck # tsc --noEmit, strict mode
npm run lint      # tsc --noEmit (same check, kept for convenience)
```

CI runs install, generate, test, typecheck and build on every push (see
`.github/workflows/ci.yml`).

---

## 8. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Environment variable not found: DATABASE_URL` | copy `.env.example` to `.env` |
| `P1001 Can't reach database server` | wrong host/port, or `?sslmode=require` missing |
| `P3005 The database server could not be reached` / “migration not applied” | run `npx prisma migrate resolve --applied 20261107163000_init` (see §3) |
| `P3009 migrate found failed migrations` | fix the migration folder, or run with `prisma migrate dev` locally |
| Login returns 401 but the password is right | cookie blocked → set `COOKIE_SECURE=false` for plain HTTP |
| `prisma generate` complains about the provider | the provider must be a literal (`"sqlite"` / `"postgresql"`) |
| Port 3000 already in use | `PORT=3001 npm run dev` |
| `the URL must start with the protocol file:` | a `.env.local` holding a Postgres URL overrides `.env` - delete it, or run `DATABASE_URL=file:./devflow.db npm run dev` |

---

## 9. API reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Sign in (sets the httpOnly session cookie) |
| `POST` | `/api/auth/logout` | Clear the session |
| `GET` | `/api/auth/me` | Current user |
| `GET · POST` | `/api/boards` | List / create boards |
| `GET · PATCH · DELETE` | `/api/boards/:id` | Read / rename / delete a board |
| `POST` | `/api/boards/:id/columns` | Add a column |
| `PATCH · DELETE` | `/api/boards/:id/columns/:columnId` | Rename / delete a column |
| `POST` | `/api/tasks` | Create a task |
| `PATCH · DELETE` | `/api/tasks/:id` | Edit / move / delete a task |
| `GET` | `/api/health` | Health check (`?deep=1` pings the DB) |

All board, column and task endpoints are scoped to the authenticated owner.
