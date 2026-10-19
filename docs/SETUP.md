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

```bash
# 1. point the schema at Postgres
#    prisma/schema.prisma → provider = "postgresql"
# 2. set the connection string in .env
DATABASE_URL="postgresql://user:password@localhost:5432/devflow"

npx prisma db push
npm run dev
```

For a hosted database (Neon, Supabase, Railway…) the same steps apply — just
paste the connection string. In serverless environments use the **pooled** URL
and the unpooled one for migrations.

---

## 4. Docker

```bash
docker compose up --build     # app on :3000, postgres on :5432
```

`docker-compose.yml` ships the app + a Postgres service. Set `DATABASE_URL` to
`postgresql://devflow:devflow@db:5432/devflow` and switch the Prisma provider
to `postgresql` before building.

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
| `NEXT_PUBLIC_APP_NAME` | optional — white-label the app name |

---

## 6. Deploy on Vercel

The repo ships a `vercel.json` with a ready-to-use Next.js configuration:

```bash
vercel link --project your-project
vercel --prod
```

For a hosted database, add the Neon (or any Postgres) integration in the
Vercel dashboard, then apply the schema with the production schema:

```bash
npx prisma generate --schema prisma/schema.postgres.prisma
npx prisma db push     --schema prisma/schema.postgres.prisma
npm run build:vercel
```

---

## 7. Tests & quality

```bash
npm test          # Vitest (auth primitives + API validation)
npm run typecheck # tsc --noEmit, strict mode
npm run lint      # ESLint
```

CI runs the three commands above on every push (see `.github/workflows/ci.yml`).

---

## 8. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Environment variable not found: DATABASE_URL` | copy `.env.example` to `.env` |
| `P1001 Can't reach database server` | wrong host/port, or `?sslmode=require` missing |
| Login returns 401 but the password is right | cookie blocked → set `COOKIE_SECURE=false` for plain HTTP |
| `prisma generate` complains about the provider | the provider must be a literal (`"sqlite"` / `"postgresql"`) |
| Port 3000 already in use | `PORT=3001 npm run dev` |

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
| `POST` | `/api/tasks` | Create a task |
| `PATCH · DELETE` | `/api/tasks/:id` | Edit / move / delete a task |

All board, column and task endpoints are scoped to the authenticated owner.
