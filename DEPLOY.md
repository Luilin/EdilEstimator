# Deploy — GitHub + Railway

Questa app è una SPA (Vite + React) senza backend. Su Railway viene servita da
`server.mjs`, un piccolo server Node che:

- serve la cartella `dist` con i MIME corretti;
- comprime con gzip i file di testo;
- imposta cache lunga per gli asset con hash e `no-cache` per `index.html` e `sw.js`;
- fa il fallback su `index.html` per le rotte dell'app (SPA).

---

## 1. Modalità dati: locale o Firebase

La modalità si sceglie in fase di **build** con la variabile `VITE_LOCAL_MODE`.

| Modalità | Comportamento | Cosa serve |
| --- | --- | --- |
| **Locale** (consigliata per iniziare) | Login con qualsiasi email, dati in IndexedDB nel browser di chi usa l'app | niente |
| **Firebase** | Login reale, dati su Firestore, condivisione col team | progetto Firebase configurato e dominio autorizzato |

La build di default (`npm run build`) usa **Firebase**; `npm run build:local`
forza la modalità locale. Su Railway conviene agire per variabile:

- locale: imposta `VITE_LOCAL_MODE=true` tra le Variables del servizio;
- Firebase: lascia la variabile vuota/assente.

> Nota: i dati locali e quelli Firebase sono archivi separati. Il passaggio da
> una modalità all'altra non migra i progetti.

### Se scegli Firebase

1. Firebase Console → **Authentication** → *Settings* → **Authorized domains**:
   aggiungi il dominio Railway (`<progetto>.up.railway.app` e l'eventuale dominio personalizzato).
2. Verifica che le regole Firestore siano pubblicate (`firestore.rules` nel repo).
3. Controlla i dati in `firebase-applet-config.json`.

---

## 2. GitHub

```bash
git init
git add .
git commit -m "Initial commit"
```

Crea un repository **privato** su GitHub e collegalo:

```bash
git remote add origin https://github.com/<utente>/<repo>.git
git branch -M main
git push -u origin main
```

Oppure, con GitHub CLI:

```bash
gh auth login
gh repo create <repo> --private --source=. --remote=origin --push
```

---

## 3. Railway

1. Vai su [railway.app](https://railway.app) e accedi con GitHub.
2. **New Project → Deploy from GitHub repo** → scegli questo repository.
3. Railway legge `railway.json`:
   - build: `npm ci && npm run build`
   - start: `node server.mjs`
   - healthcheck: `/`
4. Aggiungi le variabili del servizio (tab **Variables**):
   - `VITE_LOCAL_MODE=true` se vuoi la modalità locale.
5. **Settings → Networking → Generate Domain** per ottenere l'URL pubblico.
6. Ogni push su `main` rilancia automaticamente il deploy.

### Verifica rapida in locale (come su Railway)

```bash
npm run build:local
PORT=4173 npm start
# http://localhost:4173
```

Su Windows PowerShell:

```powershell
$env:PORT=4173; npm start
```

---

## 4. PWA e aggiornamenti

Il service worker (`public/sw.js`) mette in cache l'app shell. Dopo un deploy:

1. il nuovo `index.html` viene preso dalla rete (la navigazione è network-first);
2. i nuovi asset hanno nomi con hash, quindi non restano versioni vecchie.

Se un utente vede ancora la versione precedente, basta un ricaricamento forzato
(`Ctrl+Shift+R`) o la chiusura delle schede dell'app.
