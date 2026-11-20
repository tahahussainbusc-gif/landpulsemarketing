# land-pulse-marketing
A real estate portal website for Sargodha offering property listings, search filters, and ROI calculators.

## Netlify deployment

`netlify.toml` prepares the static site in `dist/` and deploys the AI endpoints separately as Netlify Functions. Only website assets, content, and `/admin/` are published; server code, dependencies, and project configuration stay outside the public directory. Connect this repository to Netlify and deploy from the `main` branch.

## AI assistant

The visitor chat and admin content generator use OpenAI (`gpt-4o-mini`) through Netlify AI Gateway. The modern function runtime supplies managed credentials; no manually configured provider key is needed. Keep provider credentials out of browser code and repository files.

The unused legacy `GEMINI_API_KEY` setting was confirmed to contain ordinary public site text instead of a valid key. It caused secret-scanning false positives throughout the website. Its deletion was denied by the configuration API, so only that unused setting is excluded from scanning. All other secret checks remain enabled, including checks for the OpenAI credentials actually used by the assistant. The functions do not read the legacy Gemini setting.

Run `npm test` to check AI response handling, request validation, and admin authorization without contacting a live AI provider.

## Firebase Admin

The custom admin page is available at `/admin/`. It uses Firebase Email/Password Authentication, Firestore for content, and Firebase Storage for uploaded media.

Before using it:

1. In Firebase Authentication, enable Email/Password and create the admin user's account. Add the deployed Netlify domain to Firebase Authentication's authorized domains.
2. Create a Firestore database and Firebase Storage bucket. From the project root, deploy the checked-in rules with `firebase deploy --project landpulsemarketing-a7bce --only firestore:rules,storage`.
3. Copy the admin user's Authentication UID. In Firestore, create `admins/{UID}` and set `role` to the exact string `admin`. Only this manually provisioned UID can edit content; users cannot grant themselves admin access.
4. Sign in at `/admin/` and use **Import missing JSON documents** once to migrate the existing content. This only creates Firestore documents that do not already exist. The website then reads editable content exclusively from Firestore; the content JSON files are kept only as migration sources. `assets-manifest.json` remains static metadata for image and video paths.

The available documents are homepage content, property listings, premium projects, social links, and the CEO, Manager, and Sales Executive profiles. Select a document in the admin page to edit its JSON and save it to Firestore. Uploaded images and videos are stored in Firebase Storage; copy the returned URL into the relevant JSON field and save the document. Uploads are limited to 50 MB.

The AI copy endpoint verifies the existing Firebase session's signature, issuer, audience, and expiration, then requires the server-controlled `admins/{UID}` role to be `admin`. It accepts the same login as the admin page and does not require a separate Netlify Identity account or a service-account key. Company Stats should contain verified figures before publishing. Premium projects whose title or location contains "Town" remain visible, but their price is intentionally hidden. The homepage welcome intro fades out after 3.8 seconds.
