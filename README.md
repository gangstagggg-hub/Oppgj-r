# Oppgjør

En liten PWA (Progressive Web App) for å holde styr på hvem som skylder deg,
hvem du skylder, og hva du ønsker å kjøpe.

## Filer

```
index.html        Gjeld-siden (hovedsiden)
style.css         styling for Gjeld-siden
app.js            logikk for Gjeld (lister, valuta, lagring, installasjon)
loan.js           beregningsmotor: saldo, autotrekk, renter, nedbetalingsprognose
detail.js         detaljark: betalingslogg og nedbetalingsberegner
onskeliste.html   Ønskeliste-siden
onskeliste.css    styling for Ønskeliste-siden
onskeliste.js     logikk for Ønskeliste
manifest.json     PWA-manifest (navn, ikon, farger)
sw.js             service worker for offline-bruk
icons/            app-ikoner i ulike størrelser
```

## Legge det ut på GitHub Pages

1. Lag et repo på GitHub og last opp alle filene i denne mappen.
   Behold mappestrukturen: `icons/` må ligge på samme nivå som `index.html`.
   GitHub Pages skiller mellom store og små bokstaver i filnavn.
2. Gå til **Settings → Pages**.
3. Under **Source**, velg branch `main` og mappe `/ (root)`. Lagre.
4. Etter et minutt eller to er siden tilgjengelig på
   `https://<brukernavn>.github.io/<repo-navn>/`.

GitHub Pages serverer over HTTPS, som kreves for at service worker og
«installer app» skal virke. `file://` fungerer ikke fullt ut.

### Oppdatere en eksisterende versjon

Last opp de nye filene over de gamle. **Bytt også versjonsnummeret i `sw.js`**
(`CACHE_NAME`, f.eks. `oppgjor-v2` til `oppgjor-v3`). Uten det kan telefonen
fortsette å vise den gamle versjonen fra cachen.

## Installere som app på telefonen

- **Android (Chrome):** åpne lenken, og en bunnlinje med «Installer» dukker
  opp. Trykk på den.
- **iPhone (Safari):** trykk på Del-ikonet og velg «Legg til på Hjem-skjerm».

## Bruk

- **Gjeld:** `+ Ny gjeld` legger til en post. Dobbelttrykk på en person for å
  legge til flere beløp og se alle enkeltbeløpene. Sveip mot venstre for å slette.
- **Ønskeliste:** `+ Ny ting` legger en ting nederst på listen. Dra i
  håndtaket for å endre rekkefølge, sveip mot venstre for å slette. Hver ting
  viser samlet beløp for den selv og alt over den.
- Fyll inn «Jeg har nå» for å se hva pengene rekker til. Trykk på en av de fire
  boksene for å velge kombinasjon, og dobbelttrykk for detaljer.
  Kombinasjonene bruker tallene fra Gjeld-siden.

## Autotrekk, renter og nedbetaling

- Under **Avdrag og renter** i skjemaet velger du rente (ingen, årlig eller løpende)
  og eventuelt autotrekk per måned.
- **Årlig rente** legges til ved midnatt nyttårsaften, med full årsrente på saldoen da.
- **Løpende rente** er årsrenten delt på 365, lagt til saldoen hver dag.
- Trykk én gang på en person for å åpne posten (har personen flere poster, åpnes en liste du trykker videre fra). **Betalinger** viser
  loggen. Trykk på en betaling for å endre eller slette den. En slettet
  autobetaling kommer ikke tilbake.
- **Nedbetaling** er en interaktiv beregner: flytt på betaling og rente og se
  hvor lenge det varer og hva renten koster. «Bruk som plan» lagrer den.

## Data og lagring

Alt lagres i nettleserens `localStorage` på enheten:

- `oppgjor:v1` er gjeld og valuta
- `oppgjor:wishlist:v1` er ønskelisten og «Jeg har nå»

Dataen overlever at du lukker appen eller mister nett, men synkroniseres ikke
mellom enheter. Sletter du nettleserdata for siden, forsvinner den.

`localStorage` deles av alle apper på samme `github.io`-adresse. Nøklene
over er egne, så de kolliderer ikke med andre apper.
