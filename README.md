# Oppgjør (Android)

WebView-app som pakker nettsiden i `web/` til APK og AAB via GitHub Actions.

## Oppdatere appen
1. Bytt filene i `web/` med nye versjoner.
2. Øk `VERSION_NAME` i `version.properties` (valgfritt, bare visningsnavnet).
3. Last opp til GitHub. Under **Actions** bygges APK og AAB automatisk, og
   filene ligger under «Artifacts» når kjøringen er ferdig.
   `versionCode` øker av seg selv for hver kjøring.

## Secrets (Settings → Secrets and variables → Actions)
`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
Verdiene står i filen `oppgjor-secrets.txt` som ikke skal ligge i repoet.
Behold nøkkelfilen trygt. Mister du den, kan du ikke lenger oppdatere appen i Play Store.
