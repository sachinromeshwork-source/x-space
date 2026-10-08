# X Space
1. Supabase SQL editor (X Base project): run `supabase/schema.sql` once.
2. Supabase Auth: disable "Confirm email" (X Space signs users in with mobile + password, mapped to a hidden email).
3. `cp .env.example .env.local`, fill URL + anon key, `npm i && npm run dev`.
4. Vercel: import repo, set the same two env vars. Framework preset: Vite.
