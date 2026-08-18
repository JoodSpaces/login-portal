# JOOD Tracker — Guest & Finance Tracker

A standalone tool to track guests, bookings, occupancy, income and expenses
across JOOD units. Login/logout for multiple users, with **admin** (sees all
units) and **owner** (sees only their own) roles.

## Files
- `index.html` — sign-in page
- `app.html` — the tracker (dashboard, bookings, calendar, finances, reports)
- `app.js` — application logic
- `supabase-client.js` — Supabase config + data layer
- `schema.sql` — database tables + row-level security

## Setup — Supabase (multi-user)
1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste all of `schema.sql` and run it.
3. In **Project Settings → API**, copy your **Project URL** and **anon/publishable key**.
4. Open `supabase-client.js` and replace the two placeholders at the top:
   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   const SUPABASE_KEY = 'YOUR-PUBLISHABLE-ANON-KEY';
   ```
5. In **Authentication → Users**, add each user (email + password).
6. In **Table editor → profiles**, set each user's `role` to `admin` or `owner`
   (a profile row is created automatically on first login; edit the role there).
7. Add units in the app — each unit's `owner_id` should match the owner's user id
   (admins can create units for any owner via SQL, or use the app while signed in
   as that owner).

## Deploy on GitHub Pages
1. Push this `tracker/` folder to a GitHub repo.
2. **Settings → Pages → Source: main branch**, folder `/` (or `/tracker`).
3. Your tool is live at `https://<user>.github.io/<repo>/tracker/`.

> The anon key is safe to expose in the browser — row-level security in
> `schema.sql` ensures each user only reads/writes their own data.

## What it tracks
- **Bookings** — guest, unit, dates, nights, guests, source, nightly rate,
  total, platform fee, cleaning fee, payment status, contact, notes
- **Finances** — gross income, platform fees, expenses (by category),
  owner payouts, net profit (all in EGP)
- **Reports** — revenue vs expenses, income by source, occupancy trend,
  expenses by category
- **Export** — bookings and finances to CSV
