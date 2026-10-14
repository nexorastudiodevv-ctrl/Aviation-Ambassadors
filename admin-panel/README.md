# Sofara Admin Panel

This repository contains the standalone article dashboard. The Firebase web configuration in `firebase-config.js` is client configuration, not a service-account key. Never add a Firebase service-account private key or a GitHub token to this repository.

## Hosting

Enable GitHub Pages for this repository from **Settings → Pages** and select the `main` branch with the root folder. The dashboard can then be opened at:

`https://nexorastudiodevv-ctrl.github.io/sofara-admin-panel/`

Add `nexorastudiodevv-ctrl.github.io` to Firebase Authentication's authorized domains. Keep Firebase Authentication enabled and grant the admin user the `admin: true` custom claim. Firestore rules must restrict article writes to that admin claim.

## Article publishing

The dashboard saves article documents to the `articles` collection in Firestore. To publish immediately from the dashboard, deploy the website repository to Vercel and configure `GITHUB_REPOSITORY`, `GITHUB_TOKEN` (Fine-grained token with **Actions: Read and write**), `ADMIN_ALLOWED_ORIGINS`, and `FIREBASE_SERVICE_ACCOUNT` in the Vercel project environment. Set `PUBLISH_API_URL` in `firebase-config.js` to that Vercel deployment URL, then redeploy the dashboard. The backend verifies the Firebase ID token and the `admin: true` custom claim before dispatching the GitHub Actions workflow. Never place a GitHub token or service-account key in this dashboard.

The GitHub Actions workflow also runs every 15 minutes and can be started manually from **Actions → Publish Firebase articles → Run workflow**.

## Affiliate links

In an article, optionally enter an HTTPS partner URL, a short description, a button label, and choose whether the promotion appears at the beginning, middle, or end. The generated article adds a commission disclosure automatically. Add only partner links relevant to the article and follow the partner program's terms.
