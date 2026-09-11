# MySQL sync — local dev setup

The admin panel is Mongo-only, but catalog/content edits (tours, countries, airports, tour dates,
promo codes, gallery, home covers, terms) get mirrored one-way into `flyingdotcom`'s legacy MySQL
database, so its **unmodified** public PHP pages keep showing current data. See the plan doc for the
full rationale — this file only covers running it locally.

## One-time setup

This machine already has MariaDB installed via Homebrew (no Docker needed — MariaDB is compatible
enough with the client's MySQL dump for this purpose).

```bash
brew services start mariadb   # if not already running
mysql -e "CREATE DATABASE IF NOT EXISTS flyingleader_dev CHARACTER SET utf8mb4;"
```

Then load a schema — **prefer the client's real `.sql` dump** once you have it:

```bash
mysql flyingleader_dev < /path/to/clients-dump.sql
```

Until then, `scripts/dev-legacy-schema.sql` is a fallback schema reconstructed from reading the PHP
source (no `.sql` file exists in `flyingdotcom/` itself). It's good enough to develop and test the
sync logic against, but the real dump is what actually matters before go-live — in particular,
`countries`' real column names need inspecting (the PHP admin dynamically probes `SHOW COLUMNS`
because they vary — see `src/mysql/sync/countrySync.ts`).

```bash
mysql flyingleader_dev < scripts/dev-legacy-schema.sql
```

## Enabling sync

In `.env`:
```
MYSQL_SYNC_ENABLED=true
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=flyingleader_dev
MYSQL_USER=flyingleader_dev
MYSQL_PASSWORD=dev_local_only
FLYINGDOTCOM_STORAGE_ROOT=/Users/adarshahalder/projects/flyingleaderapp/flyingdotcom
```

With `MYSQL_SYNC_ENABLED=false` (the default), every sync call is a no-op and every synced
document's `mysqlSync.status` just reads `"disabled"` — nothing else is affected.

## Verifying it works

1. Create a country in the admin panel (or via the API) → check `mysql flyingleader_dev -e "SELECT * FROM countries"`.
2. Create a tour referencing that country → check `tours` for a matching row, and confirm its `image`
   column points at a real file under `flyingdotcom/storage/tours/`.
3. Stop MariaDB (`brew services stop mariadb`), edit the tour again → the Mongo write still succeeds,
   but `mysqlSync.status` flips to `"failed"` with a `lastError`. Restart MariaDB, call
   `POST /admin/tours/:id/resync` → status flips back to `"synced"`.

## Production

Per the client's own contract, `flying-leader-server` is expected to eventually run on the same
Hostinger box that already hosts `flyingdotcom` and its MySQL database — at that point
`MYSQL_HOST=localhost` just works, the same way it does for the PHP app today. No remote-MySQL
access is expected to be needed in production.
