# land-pulse-marketing
A real estate portal website for Sargodha offering property listings, search filters, and ROI calculators.

## Netlify deployment

`netlify.toml` publishes the repository root, which includes the static site, `/admin/`, and the Netlify Function. Connect this repository to Netlify and deploy from the `main` branch. The deployment itself must be started in the Netlify account; it cannot be completed from this local project alone.

## Firebase Admin

The custom admin page is available at `/admin/`. It uses Firebase Email/Password Authentication, Firestore for content, and Firebase Storage for uploaded media.

Before using it:

1. In Firebase Authentication, enable Email/Password and create the admin user's account. Add the deployed Netlify domain to Firebase Authentication's authorized domains.
2. Create a Firestore database and Firebase Storage bucket. From the project root, deploy the checked-in rules with `firebase deploy --project landpulsemarketing-a7bce --only firestore:rules,storage`.
3. Copy the admin user's Authentication UID. In Firestore, create `admins/{UID}` and set `role` to the exact string `admin`. Only this manually provisioned UID can edit content; users cannot grant themselves admin access.
4. Sign in at `/admin/` and use **Import missing JSON documents** once to migrate the existing content. This only creates Firestore documents that do not already exist. The website then reads editable content exclusively from Firestore; the content JSON files are kept only as migration sources. `assets-manifest.json` remains static metadata for image and video paths.

The available documents are homepage content, property listings, premium projects, social links, and the CEO, Manager, and Sales Executive profiles. Select a document in the admin page to edit its JSON and save it to Firestore. Uploaded images and videos are stored in Firebase Storage; copy the returned URL into the relevant JSON field and save the document. Uploads are limited to 50 MB.

The site also has a Netlify Function for AI-generated copy. It still uses Netlify Identity and is not connected to the Firebase admin login. Company Stats should contain verified figures before publishing. Premium projects whose title or location contains "Town" remain visible, but their price is intentionally hidden. The homepage welcome intro fades out after 3.8 seconds.
