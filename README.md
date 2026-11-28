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
4. Sign in at `/admin/` and use **Import first-time content** once to migrate the existing content. This only creates Firestore documents that do not already exist. The website reads published edits from Firestore and uses checked-in content JSON only as a fallback if Firestore is unavailable or a document has not been imported. `assets-manifest.json` remains static metadata for image and video paths.

The available documents are homepage content, property listings, premium projects, social links, and the CEO, Manager, and Sales Executive profiles. The admin has a sidebar for **Content Page**, **Premium Properties**, and **Property Listing**; use **Add project** or **Add listing** on the relevant page, and use section-level **Add Item** controls for homepage lists. Select a document, edit its fields, and choose **Save & publish**; unsaved edits are flagged, and changing documents asks before discarding them. The admin page gives a short guide for each document and reports a Firebase timeout instead of waiting indefinitely. Uploaded images and videos are stored in Firebase Storage; upload them from the relevant field and save the document. Uploads are limited to 50 MB.

The public website reads published content from Firestore. If Firestore is unavailable or a document has not been imported, it temporarily uses the matching checked-in JSON file so the page can still render; restore the Firebase connection and complete the import to show the latest published edits.

The CMS Persona Pulse copy assistant verifies the signed-in Firebase user and checks the server-managed `admins/{UID}` document for the `admin` role before generating a draft. It can write into an existing text field; review/edit the draft and select **Add to Web** to publish it. Firebase Authentication, Firestore, and Storage remain the CMS services; the website and AI PHP endpoints are hosted on Hostinger. Company Stats should contain verified figures before publishing. Premium projects whose title or location contains "Town" remain visible, but their price is intentionally hidden. The homepage welcome intro fades out after 3.8 seconds.
