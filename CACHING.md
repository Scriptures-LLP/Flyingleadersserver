# Redis Caching

A read-through (cache-aside) cache in front of the **public catalog endpoints**, shared by the mobile app and the website. **MongoDB is always the source of truth** — Redis is an optional accelerator. If it is not configured or goes down, every request transparently falls back to MongoDB and the platform keeps working.

## Architecture

```
app / website ──GET──▶ Express route ──▶ cacheRoute() middleware
                                             │ HIT  → return stored JSON
                                             │ MISS → run controller → MongoDB → store in Redis → return
                                             └ Redis down/ERROR → run controller → MongoDB (no caching)

admin writes ──▶ Mongoose model ──post-hook──▶ invalidate(namespaces)  (bumps version counter)
```

- **One connection**: `src/config/redis.ts` owns the single `ioredis` client (`getRedis()`). Controllers never open their own.
- **Cache service**: `src/services/cache.service.ts` — the `cacheRoute(namespace, ttl)` middleware, `invalidate(...namespaces)`, and `registerCacheInvalidation(schema, namespaces)` (the model hook).
- **Fail-open**: `enableOfflineQueue: false` + `maxRetriesPerRequest: 1` make commands reject instantly when Redis is unreachable; the middleware catches that and serves Mongo.

## Cached endpoints, namespaces & TTLs

| Endpoint | Namespace | TTL env var | Default |
|---|---|---|---|
| `GET /api/v1/home` | `home` | `CACHE_TTL_HOME` | 300s (5 min) |
| `GET /api/v1/tours` (list/search/filter) | `tours` | `CACHE_TTL_TOURS` | 300s |
| `GET /api/v1/tours/:slug` (detail) | `tours` | `CACHE_TTL_TOUR_DETAIL` | 600s (10 min) |
| `GET /api/v1/tours/:slug/dates` | `tours` | `CACHE_TTL_TOURS` | 300s |
| `GET /api/v1/tours/:slug/airports` | `tours` | `CACHE_TTL_TOURS` | 300s |
| `GET /api/v1/tours/:slug/reviews` | `tours` | `CACHE_TTL_TOURS` | 300s |
| `GET /api/v1/countries` + `/:slug` | `countries` | `CACHE_TTL_COUNTRIES` | 3600s (1 hr) |
| `GET /api/v1/categories` | `categories` | `CACHE_TTL_CATEGORIES` | 1800s (30 min) |

Only **anonymous GETs** are cached. A request carrying an `Authorization` header bypasses the cache (never serve user-specific data from a shared key). Bookings, payments, profile, wishlist, chat, etc. are **never** cached. Admin (`/api/v1/admin/*`) routes are **not** cached, so the admin panel always reads live Mongo.

## Cache keys

`fl:cache:<namespace>:v<version>:<full-request-URL>`

The full URL includes the query string, so pagination/filters/slugs each get a **distinct key** automatically. `<version>` is a per-namespace counter (see below).

## Invalidation (version counters — no `KEYS`/`SCAN`)

Each namespace has a counter at `fl:cache:ver:<namespace>`. Every key embeds the current value. To invalidate, we `INCR` the counter: all old keys become unreachable instantly and expire on their own TTL. This is O(1), safe across multiple backend instances, and never blocks Redis.

Invalidation is wired at the **model layer** via `registerCacheInvalidation` (Mongoose `save` / `insertMany` / `findOneAnd*` / `update*` / `delete*` hooks), so **any** write path invalidates — a controller can't forget.

| Admin action (model) | Namespaces bumped |
|---|---|
| Tour create/update/delete, price/seats/images | `home`, `tours`, `countries` |
| Tour dates (seats/price per departure) | `tours`, `home` |
| Tour gallery media | `tours` |
| Tour airport prices | `tours` |
| Category create/update/delete | `categories`, `tours`, `home` |
| Country/destination create/update/delete | `countries`, `tours`, `home` |
| Home cover create/update/delete | `home` |

Result: after any admin change, the next app/website request for the affected data is a **MISS** and re-reads fresh from Mongo — no waiting for TTL.

## Frontend (no Redis in clients)

Neither client talks to Redis; both call the same backend APIs and benefit from the faster cached responses.

- **Admin panel** (React Query): mutations already `invalidateQueries`, `staleTime` is 30s, and `/admin/*` is uncached — so created/updated/deleted tours and dashboard stats refresh immediately.
- **Mobile app** (custom cache): `useForegroundRefresh` drops tour caches on every foreground (full refresh after 1h) and `useHomeData` refetches on resume — so admin updates appear on next foreground. No indefinite client staleness.

## Configuration

```bash
# .env — all optional. Omit REDIS_URL (or set CACHE_ENABLED=false) to run without Redis.
REDIS_URL=redis://127.0.0.1:6379         # local; managed providers use rediss://user:pass@host:port
CACHE_ENABLED=true
CACHE_TTL_HOME=300
CACHE_TTL_TOURS=300
CACHE_TTL_TOUR_DETAIL=600
CACHE_TTL_COUNTRIES=3600
CACHE_TTL_CATEGORIES=1800
```

## Deployment

### Local development
```bash
# Option A: Docker
docker run -d --name fl-redis -p 6379:6379 redis:7-alpine
# Option B: Homebrew (mac) / apt (linux) / Memurai (Windows)
# Then:
echo 'REDIS_URL=redis://127.0.0.1:6379' >> .env
npm run dev
```
On start you'll see `[cache] Redis caching enabled` and `[redis] connected and ready`.

### Production (e.g. Render)
1. Provision a managed Redis (Render Key Value / Upstash / Redis Cloud). Prefer a TLS `rediss://` URL in the same region as the backend.
2. Add env vars to the backend service: `REDIS_URL` (as a **secret**), optionally the `CACHE_TTL_*`. Do **not** commit the URL or print it in logs (the client only logs connection status, never the URL).
3. Deploy the backend (`npm run build` → `npm start`). No app/admin redeploy is required for caching, but deploy them normally for the other changes.

### Verify the connection
- Logs show `[redis] connected and ready`.
- `redis-cli -u "$REDIS_URL" PING` → `PONG`.
- Hit a cached endpoint twice and watch the response header: first `X-Cache: MISS`, second `X-Cache: HIT`. The server logs `[cache] MISS …` then `[cache] HIT …`.

### Monitoring
- Server logs: `[cache] HIT|MISS|ERROR|INVALIDATE …` lines + the `X-Cache` response header let you compare cached vs uncached.
- `redis-cli -u "$REDIS_URL" INFO stats` → `keyspace_hits` / `keyspace_misses`.
- `redis-cli -u "$REDIS_URL" --scan --pattern 'fl:cache:*'` to inspect keys.

### Clearing the cache safely
- **One namespace** (preferred — instant, non-blocking): `redis-cli -u "$REDIS_URL" INCR fl:cache:ver:tours` (or `home` / `countries` / `categories`). Bumping the version orphans that namespace's keys.
- **Everything this app owns**: `redis-cli -u "$REDIS_URL" --scan --pattern 'fl:cache:*' | xargs redis-cli -u "$REDIS_URL" UNLINK` (non-blocking delete). Avoid `FLUSHALL` on a shared Redis.
