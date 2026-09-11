# Flying Leader — Server

Node/Express + MongoDB API for the Flying Leader mobile app and its admin panel (`flying-leader-admin`).

## Scope boundary

This backend is **Mongo-only** and manages the mobile app's data exclusively. It does **not** connect to
`flyingdotcom` (the client's live PHP + MySQL website) — that site keeps running entirely on its own,
managed through its own existing PHP admin. "One admin panel for app + web" is a documented **future** goal,
not solved here. See the project plan for the full rationale.

The MongoDB Atlas cluster this connects to is shared with unrelated other projects. `MONGO_URI` must always
point at a dedicated database (`flying_leader_dev` / `flying_leader_prod`) — `src/config/db.ts` refuses to
connect to any of the cluster's other known databases as a safety net.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in secrets (a working .env already exists locally, gitignored)
npm run seed            # creates an admin user, a manager, and a few sample countries/categories/tours
npm run dev              # starts the API on http://localhost:4001 with hot reload
```

Health check: `GET /health`. Admin login: `POST /api/v1/admin/auth/login` with the seeded admin credentials
printed by `npm run seed`.

## Status

**Phase 1** (this commit): backend skeleton, JWT auth (customers + admin/manager), CRUD for Tours, Countries,
Airports, Categories, and a `GET /api/v1/home` aggregate for the mobile app's Home screen.

Bookings, Razorpay payments, promo codes, gallery/covers, and the contact-message/manager workflow are not
built yet — see the project plan for the phased rollout.
