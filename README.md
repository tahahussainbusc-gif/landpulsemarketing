# land-pulse-marketing
A real estate portal website for Sargodha offering property listings, search filters, and ROI calculators.

## Decap CMS

The site is deployed from the repository root so `/admin/config.yml` is included in the Netlify publish output. After deploying, verify that `https://landpulsemarketing.netlify.app/admin/config.yml` returns the CMS YAML rather than a 404.

For CMS sign-in and Git Gateway writes, enable Netlify Identity and Git Gateway in the Netlify site settings, then invite the CMS users through Identity. The CMS uses the `git-gateway` backend configured for the `main` branch.

The CMS edits the homepage copy, welcome intro, header links, and animated circular Company Stats in `content/site.json`; the CEO, Sales Executive, and Manager profiles individually under `content/team/`; featured projects in `PremiumProjects/inventory.json`; property listings in `content/properties.json`; and individually addable, editable, hideable, or removable footer social buttons in `content/social-links.json`. Profile visibility is controlled separately for each team member, and their uploaded intro videos play on hover. Testimonials, advantages, footer links, logo, and virtual tour media are also CMS-managed. Uploaded photos and videos are stored in `images/uploads/`. The page loads these files directly, so CMS edits are reflected after publishing. Set the sample Company Stats counts to verified company figures before publishing. The homepage also displays a welcome intro screen that fades out after 3.8 seconds.

Property listings, premium projects, testimonials, advantages, footer links, and social buttons use CMS list controls, which allow admins to add, edit, reorder, and remove entries. Individual team profile files remain separate for the CEO, Sales Executive, and Manager; toggle **Show profile** to hide or restore a profile without deleting its contact details.
