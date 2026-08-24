# Firebase Hosting deployment

This project is configured for Firebase Hosting using project `my-website-db-622db`.

## First deployment

```bash
npm install
npx firebase-tools login
npm run build:firebase
npx firebase-tools deploy --only hosting --project my-website-db-622db
```

Or after Firebase CLI is installed globally:

```bash
firebase login
npm run build:firebase
npm run deploy:firebase
```

The deployed app uses the same Firebase client configuration already present in `src/firebase.ts` and stores application data in Firestore collections used by the app.

## Important

The Firebase client API key in `src/firebase.ts` is a browser client configuration value, not a server secret. Firestore Security Rules must still be configured correctly before real business data is used in production.
