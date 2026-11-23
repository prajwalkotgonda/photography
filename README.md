# Akkshay Kumbhar Photography

Capture Moments. Manage Everything.

The studio uses React and Vite on Vercel, with Firebase Authentication, Firestore, Storage, and a callable Cloud Function. The application requires a configured Firebase project and an administrator account.

## Firebase setup

1. Create a [Firebase project](https://console.firebase.google.com/) and add a Web App. Enable the Blaze billing plan for Functions and Cloud Storage. Create a Firestore database in Native mode using the default database ID and create the default Storage bucket. See the [Functions deployment guide](https://firebase.google.com/docs/functions/get-started).
2. In Authentication, enable the Email/Password provider. Create the administrator in the Users tab and copy its UID. In Firestore, create the document `admins/primary` with a string field `uid` containing that UID. Use the Firebase console or an administrator script to edit this document. The application grants access only to that UID.
3. Copy `.env.example` to `.env.local`. Fill in the values from the Web App SDK configuration. Keep `VITE_FIREBASE_FUNCTIONS_REGION` at `us-central1` unless you also change the deployment region in `functions/index.js`. Add `localhost` and the eventual Vercel domain in Authentication → Settings → Authorized domains.
4. Install Node.js 22.12 or newer and the Firebase CLI. From the project root, run the following commands, substituting your actual Firebase project ID.

   ```powershell
   npm install
   npm --prefix functions install
   firebase login
   firebase deploy --project YOUR_PROJECT_ID --only firestore:rules,storage,functions
   npm run dev
   ```

5. Approve the Firebase prompt that authorizes Storage rules to read Firestore, if shown. Team profile photos use authenticated Storage downloads. Configure the bucket's CORS policy with your studio origin and any local development origin. See the [Storage download guide](https://firebase.google.com/docs/storage/web/download-files#cors_configuration).

   ```json
   [{"origin":["https://YOUR_VERCEL_DOMAIN","http://localhost:5173"],"method":["GET"],"maxAgeSeconds":3600}]
   ```

   Save this to `cors.json`, substituting your domain, then run `gcloud storage buckets update gs://YOUR_BUCKET --cors-file=cors.json` with the Google Cloud CLI.

## Vercel deployment

Import this directory from your Git provider or deploy from the Vercel CLI. Select the Vite preset, Node.js 22 or newer, and add the `VITE_FIREBASE_*` variables in the project environment for each intended deployment environment. Vercel builds to `dist`. The included rewrite enables direct URLs such as `/calendar`. Deploy Firebase separately before opening the deployed app. [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)

## Verification

Run `npm test` for business rule checks and `npm run build` for the production bundle. The emulator integration checks use the fixed demo project ID and can run without a Firebase account. Install the Firebase CLI and a supported Java runtime, install both sets of npm dependencies, then run:

   ```powershell
   firebase emulators:exec --project demo-photography --only auth,firestore,functions,storage 'node scripts/verify-emulators.mjs'
   ```

Use a test Firebase project for the following browser smoke test.

1. Verify administrator sign-in, refresh persistence, sign-out, password reset and denial of access with another account.
2. Add a client, team member with a photo, package and service. Create a wedding booking with an advance and confirm the payment appears once. Change the package price and verify the saved booking keeps its original price.
3. Create an exposing job in multiple roles, check that it appears in each role calendar and the unified calendar, and try to assign the same team member to an overlapping event. Verify an adjacent assignment is accepted.
4. Record another payment, a team payment and a paid expense. Compare the booking balance with Finance and Reports, test PDF and Excel downloads, then review client and team histories.
5. Filter by date, category and team member and check that direct page links and mobile navigation work.

Booking value uses event dates. Revenue and expenses use transaction dates. Pending payments use the lifetime ledger for bookings selected by the date filter. Estimated profit subtracts recorded expenses and team payments from booking value. Cash profit uses collected revenue and paid expenses, including recorded team payments. Package prices cover included services. Additional services have independent prices. The calendar accepts same-day time slots in studio local time. All currency values in Firestore are integer paise.
