# SevaLog

A shared caregiving log hosted as a static site on Vercel, with Supabase Auth and Postgres. No application server or build step is needed.

## Finish Supabase setup

1. Open your Supabase project, then SQL Editor > New query.
2. Paste all of `supabase/schema.sql` and click Run. Run this initial schema only once; do not rerun against existing tables. The script creates the tables, access policies, and invitation functions together in a transaction.
3. Open Authentication > URL Configuration. Set Site URL to `https://seva-log-three.vercel.app/`. Add that exact URL to Redirect URLs, plus `http://localhost:4173/` for local testing. Update both if your domain changes.
4. Enable Email authentication under Authentication > Sign In / Providers (the dashboard may label this Providers).
5. For a private test without configuring email delivery: in Authentication > Users > Add user > Create new user, create two test accounts with different emails/passwords and Auto Confirm enabled. Sign in with those accounts in the app. This avoids relying on confirmation emails for testing.
6. Before opening registration to families, configure a custom SMTP sender under Authentication email settings and leave Confirm email enabled. Supabase's default sender only delivers to project team addresses. Password reset emails also need working email delivery. Test confirmation and password reset with a non-team email address.

`config.js` already contains your supplied project URL and publishable key. This key is intentionally public. Never substitute a secret/service_role key or database password. No Vercel environment variables are required for this static setup.

Email delivery documentation: https://supabase.com/docs/guides/auth/auth-smtp

## Update the existing GitHub repository

Use the SAME repository connected to your existing Vercel project.

1. Open the repository on GitHub, on the branch Vercel uses for Production (usually main).
2. Choose Add file > Upload files.
3. Upload `index.html`, `styles.css`, `app.js`, `config.js`, and `vercel.json` from this folder to the repository root, replacing the previous versions. Do not upload the surrounding folder as a nested directory. The root must contain `index.html`.
4. Commit with a message such as `Add Supabase family sharing`.
5. Vercel should start a deployment automatically. Open the project's Deployments tab and wait for Ready. If automatic deployments are disabled, redeploy the latest commit there.
6. Open `https://seva-log-three.vercel.app/` and hard-refresh (Ctrl+Shift+R).

The runtime needs only those five files. Keep `supabase/schema.sql`, `README.md`, and the tests in GitHub too for future maintenance, but the SQL runs in Supabase, not Vercel. Do not upload node_modules, test-results, or ZIP archives.

Vercel settings remain Framework: Other, empty Build Command, Output Directory: `.`.

## Test on two phones or browser profiles

Use fictional care information during testing.

1. Sign in as account A. Create an elder's care circle, enter a caregiver name, and save it.
2. Add a note or meal. Reload and confirm it remains.
3. As A, create an invitation code. Sign in as account B on another phone or an incognito window and join using that code.
4. B should see A's entry. Set B's caregiver name and add an update. A should see it within 15 seconds while the tab is visible, or immediately with Refresh updates.
5. B cannot delete A's entries. A, as owner, can delete any entry in the circle. B can delete B's own entries.
6. Create a separate circle as B. A must not see it in the circle selector. Invalid invitation codes must fail. Generating a new code invalidates the old one; codes expire after seven days.
7. Turn the network off, try adding a note, and confirm the app reports a failure without clearing your input. Reconnect and retry once. There is no offline write queue.
8. Export a backup and import it into a separate test circle. Import it again: imported entries should not duplicate. Importing into a circle makes those updates visible to all its members.
9. Sign out. The timeline and digest must disappear. Test Forgot password after configuring SMTP.

## Existing device data

Old logs are not automatically uploaded. After choosing a circle, use Import old phone logs at the SAME URL/browser where you used the original app. The original local copy remains untouched. For another URL or phone, export a JSON backup from the old app first, then use Import backup. Changing domains does not transfer browser storage.

## Behavior and boundaries

- Updates refresh every 15 seconds while visible, on returning to the tab, and using Refresh updates. This MVP uses polling, not Supabase Realtime.
- Only members can read a circle or its entries. Only the owner can rename the elder or create invitation codes. Membership can only be added through a valid invitation or circle creation.
- Invitations are reusable for seven days until replaced. Replacing an invitation does not remove members who already joined. Member removal and ownership transfer are not yet included.
- Each entry records the authenticated author's ID; caregiver names are display labels. Imported entries are attributed to the importing account, retaining the original caregiver label.
- Care dates use the logging device's local date/time. There is no shared circle timezone yet.
- Quick actions fill the form and require explicit submission; they do not automatically record medication as taken.
- Logs live in Supabase. The Supabase SDK stores the login session in the browser; the app does not cache shared logs in localStorage.
- No prescriptions, document uploads, WhatsApp bot, or offline sync.

## Local development

Run `python -m http.server 4173` here and open `http://localhost:4173/`.
The Supabase JavaScript SDK is pinned and loaded from jsDelivr; an internet connection is required.

## Automated verification

Run `npm ci`, then `npm test` to execute the schema in an isolated Postgres-compatible PGlite database. Tests cover non-member isolation, author spoofing, owner privileges, invitation replacement/expiry, duplicate imports, and anonymous denial. No live project data is used.

With the local server running and Microsoft Edge installed, run `npm run test:browser`. This uses the real Supabase SDK with mocked HTTP responses to check UI workflows and mobile overflow. Screenshots are written to `test-results/`. These tests do not replace the two-account test against your own Supabase project after applying the schema.
