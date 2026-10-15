# Sofara Admin Panel

This repository contains the standalone article dashboard. The Firebase web configuration in `firebase-config.js` is client configuration, not a service-account key. Never add a Firebase service-account private key or a GitHub token to this repository.

## Hosting

Enable GitHub Pages for this repository from **Settings → Pages** and select the `main` branch with the root folder. The dashboard can then be opened at:

`https://nexorastudiodevv-ctrl.github.io/sofara-admin-panel/`

Add `nexorastudiodevv-ctrl.github.io` to Firebase Authentication's authorized domains. Keep Firebase Authentication enabled and grant the admin user the `admin: true` custom claim. Firestore rules must restrict article writes to that admin claim.

## Article publishing

The dashboard saves article documents to the `articles` collection in Firestore. Published articles appear on the live homepage and blog directly from Firestore. GitHub Actions periodically generates static article pages and updates the sitemap for search engine indexing. The dashboard requires an authenticated Firebase account with the `admin: true` custom claim, and Firestore rules must allow public reads only for published articles.

The GitHub Actions workflow runs every 15 minutes and uses the repository-scoped `GITHUB_TOKEN` to publish generated pages. Ensure the repository permits workflows to write to `main`.

## Affiliate links

In an article, optionally enter an HTTPS partner URL, a short description, a button label, and choose whether the promotion appears at the beginning, middle, or end. The generated article adds a commission disclosure automatically. Add only partner links relevant to the article and follow the partner program's terms.
