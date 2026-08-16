# Oppgjør

En liten PWA (Progressive Web App) for å holde styr på hvem som skylder deg,
og hvem du skylder.

## Filer

```
index.html      hovedsiden
style.css       all styling
app.js          all logikk (lister, valuta, lagring, installasjon)
manifest.json   PWA-manifest (navn, ikon, farger)
sw.js           service worker for offline-bruk
icons/          app-ikoner i ulike størrelser
```

## Legge det ut på GitHub Pages

1. Lag et nytt repo på GitHub og last opp alle filene i denne mappen
   (behold mappestrukturen — `icons/`-mappen må ligge på samme nivå som `index.html`).
2. Gå til repoets **Settings → Pages**.
3. Under **Source**, velg branch `main` og mappe `/ (root)`. Lagre.
4. Etter et minutt eller to er siden tilgjengelig på
   `https://<brukernavn>.github.io/<repo-navn>/`.

**Viktig:** GitHub Pages serverer siden over HTTPS, som er et krav for at
service worker og "installer app"-funksjonen skal virke. Å åpne filene
lokalt med `file://` vil ikke fungere fullt ut.

## Installere som app på telefonen

- **Android (Chrome):** åpne lenken, og en bunnlinje med "Installer" dukker
  opp automatisk. Trykk på den.
- **iPhone (Safari):** åpne lenken, trykk på Del-ikonet, og velg
  "Legg til på Hjem-skjerm". Safari støtter ikke automatiske installasjons-
  meldinger, så appen viser i stedet en påminnelse med denne beskjeden.

## Data og lagring

Alt du legger inn (personer, beløp, valuta) lagres i nettleserens
`localStorage` på enheten. Det betyr:

- Dataen overlever at du lukker appen, slår av telefonen, eller mister nett.
- Dataen er lokal for den enheten/nettleseren — den synkroniseres ikke
  mellom telefon og PC.
- Sletter du nettleserdata for siden (eller avinstallerer appen), forsvinner
  også dataen.

## Videre arbeid (forslag)

- Muligheter for å slette eller markere en post som gjort opp.
- Synkronisering mellom enheter (krever en backend/database).
- Redigere en eksisterende post.
