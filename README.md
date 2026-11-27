# land-pulse-marketing
A real estate portal website for Sargodha offering property listings, search filters, and ROI calculators.

## Hostinger deployment

Upload the repository's website files to the domain's `public_html` directory, keeping the `api/`, `admin/`, `content/`, `images/`, and `PremiumProjects/` folders in their original locations. The AI endpoints require PHP with the cURL extension enabled.

The AI key must stay on the server:

1. In Hostinger File Manager, copy `api/config.example.php` to `api/config.php`.
2. Replace `PASTE_GEMINI_API_KEY_HERE` in `api/config.php` with the Gemini API key. Do not commit this file or put the key in browser code.
3. Keep `api/.htaccess` in place; it blocks direct access to the config file.

The chat, speech, and CMS copy generator use the PHP endpoints in `api/`. Gemini uses `gemini-2.5-flash` by default for chat and content, with Gemini TTS for voice. Optional Groq and OpenAI fallback keys and model names can also be set in `api/config.php`.

## Firebase Admin

The custom admin page is available at `/admin/`. It uses Firebase Email/Password Authentication, Firestore for content, and Firebase Storage for uploaded media.

Before using it:

1. In Firebase Authentication, enable Email/Password and create the admin user's account. Add the Hostinger website domain to Firebase Authentication's authorized domains.
2. Create a Firestore database and Firebase Storage bucket. From the project root, deploy the checked-in rules with `firebase deploy --project landpulsemarketing-a7bce --only firestore:rules,storage`.
3. Copy the admin user's Authentication UID. In Firestore, create `admins/{UID}` and set `role` to the exact string `admin`. Only this manually provisioned UID can edit content; users cannot grant themselves admin access.
4. Sign in at `/admin/` and use **Import missing JSON documents** once to migrate the existing content. This only creates Firestore documents that do not already exist. The website then reads editable content exclusively from Firestore; the content JSON files are kept only as migration sources. `assets-manifest.json` remains static metadata for image and video paths.

The available documents are homepage content, property listings, premium projects, social links, and the CEO, Manager, and Sales Executive profiles. Select a document in the admin page to edit its JSON and save it to Firestore. Uploaded images and videos are stored in Firebase Storage; copy the returned URL into the relevant JSON field and save the document. Uploads are limited to 50 MB.

The CMS AI copy endpoint verifies the Firebase sign-in token and checks the `admins/{UID}` document before generating content. Firebase Authentication, Firestore, and Storage remain the CMS services; the website files and AI PHP endpoints are hosted on Hostinger. Company Stats should contain verified figures before publishing. Premium projects whose title or location contains "Town" remain visible, but their price is intentionally hidden. The homepage welcome intro fades out after 3.8 seconds.
