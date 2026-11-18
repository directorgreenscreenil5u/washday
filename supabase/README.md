# Washday backend (Supabase)

What is here:
- `schema.sql`: tables, row-level security and guard triggers. Customers can only see and change their own data, and cannot change their plan, credit, bills, order status or prices. Staff (listed in `staff`) can see and manage everything. Payments are written only by the server.
- `functions/sms-hook`: sends login codes by SMS through Termii.
- `functions/paystack-verify`: confirms a payment with Paystack after checkout and activates the plan.
- `functions/paystack-webhook`: Paystack's backup notice for every payment.
- `../live.js` on the website: switches the site from demo mode to the live backend once `LIVE_CFG` has the project URL and public key.

Tested: 35 security checks against a real Postgres engine (`test.mjs`), and the website flows against a simulated backend.

## Setup (about 30 minutes)

1. **Create the project.** supabase.com > New project. Region: closest to Lagos (e.g. West EU / London). Save the database password in a password manager.
2. **Run the schema.** SQL Editor > New query > paste `schema.sql` > Run. Then add yourself as admin:
   `insert into public.staff(phone,name,role) values ('8031234567','Your Name','admin');` (10 digits, no leading 0)
3. **Phone login.** Authentication > Sign In / Providers > Phone: enable. Turn off "Confirm email". Set OTP expiry to 600 seconds.
4. **Termii.** In Termii: register the sender ID `Washday` (takes 1 to 2 days) and fund the wallet. Copy the API key and base URL.
5. **Deploy the functions** (Supabase CLI, or Edge Functions > Deploy in the dashboard): `sms-hook`, `paystack-verify`, `paystack-webhook`. For `sms-hook` and `paystack-webhook`, turn off "Verify JWT".
6. **Secrets** (Edge Functions > Secrets). Paste these yourself, never into the website code:
   - `TERMII_API_KEY`, `TERMII_SENDER_ID` = Washday, `TERMII_BASE_URL`
   - `PAYSTACK_SECRET_KEY`
   - `ALLOWED_ORIGINS` = https://directorgreenscreenil5u.github.io (add the new domain later, comma-separated)
7. **SMS hook.** Authentication > Hooks > Send SMS hook > HTTPS > URL of `sms-hook`. Generate the secret and save it as the `SEND_SMS_HOOK_SECRET` secret.
8. **Paystack webhook.** Paystack dashboard > Settings > API Keys & Webhooks > Webhook URL = URL of `paystack-webhook`.
9. **Switch the site on.** In `live.js` set `LIVE_CFG.url` (Project URL) and `LIVE_CFG.key` (anon / publishable key). In `app.js` set `CONFIG.paystackKey` (pk_live_…). Both are public keys.
10. **Test** with a real ₦100 payment before announcing.

## Still to build
- Monthly renewal charges (Paystack saved card, `billing_tokens` table is ready).
- Mid-cycle plan upgrades (for now plan changes start at renewal).
- Keep prices in `schema.sql` (order_price) and `functions/_shared/paystack.ts` in step with `CONFIG` in app.js.
