# land-pulse-marketing
A real estate portal website for Sargodha offering property listings, search filters, and ROI calculators.

## Decap CMS

The site is deployed from the repository root so `/admin/config.yml` is included in the Netlify publish output. After deploying, verify that `https://landpulsemarketing.netlify.app/admin/config.yml` returns the CMS YAML rather than a 404.

For CMS sign-in and Git Gateway writes, enable Netlify Identity and Git Gateway in the Netlify site settings, then invite the CMS users through Identity. The CMS uses the `git-gateway` backend configured for the `main` branch.
