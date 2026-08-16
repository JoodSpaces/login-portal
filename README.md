# JOOD Owner Portal + Tracker

Static site — no build step. Upload the CONTENTS of this folder to a GitHub repo,
then Settings → Pages → Source: main branch, folder `/ (root)`.

## Structure
- `index.html` — entry point, redirects to the portal sign-in
- `portal/` — owner portal (login.html, dashboard.html)
- `tracker/` — guest & finance tracker (index.html sign-in, app.html)
- `i18n/` — Arabic dictionaries + EN⇄AR language layer
- `images/` — logo

## Supabase
Both tools point at the same project (`pbhudkzimquvwfsecslw`) via
`portal/supabase-client.js` and `tracker/supabase-client.js`.
The publishable/anon key is safe in the browser — row-level security in
`portal/schema.sql` and `tracker/schema.sql` restricts each user to their own data.

Before going live, add your GitHub Pages URL in Supabase →
**Authentication → URL Configuration → Site URL / Redirect URLs**,
otherwise sign-in redirects will fail.

## Accounts
- Admin: `profiles.role = 'admin'` — sees all units
- Owner: `profiles.role = 'owner'` — sees units where `units.owner_id` = their user id
