# EdilEstimator AI

Applicazione web per la gestione di computi metrici estimativi: struttura WBS, voci di costo, prezzari, SAL (stati avanzamento lavori), condivisione con team ed export Excel/PDF.

Questa copia è configurata per funzionare **anche in locale**, senza toccare i dati di produzione.

---

## Requisiti

- [Node.js](https://nodejs.org/) 20 o superiore (consigliata la versione LTS)
- npm (incluso in Node.js)

Verifica l'installazione:

```bash
node -v
npm -v
```

---

## Avvio rapido (modalità locale)

```bash
npm install
npm run dev
```

Apri il browser su **http://localhost:3000**.

In modalità locale:

- puoi accedere con **qualsiasi email** e una password di almeno 6 caratteri;
- il pulsante **Accedi come utente demo** entra con `demo@locale.it`;
- i progetti sono salvati nel `localStorage` del browser (nessun dato viene inviato a Firebase);
- i dati restano disponibili anche dopo aver riavviato il dev server, finché non svuoti i dati del sito.

> La modalità locale è attiva automaticamente con `npm run dev`.

---

---

## Modalità cloud (Firebase)

La modalità cloud usa Firebase Authentication e Firestore, come la versione pubblicata.

```bash
npm run dev:cloud
```

La configurazione si trova in `firebase-applet-config.json` e punta al progetto Firebase `computo-3a2d5`.

Per usare un progetto Firebase tuo:

1. Crea un progetto su <https://console.firebase.google.com/>.
2. Abilita **Authentication** (Email/Password e Google).
3. Crea un database **Firestore**.
4. Sostituisci i valori in `firebase-applet-config.json` con quelli della tua app web.
5. Pubblica le regole di `firestore.rules` (adattandole, vedi nota di sicurezza).
6. Aggiungi il dominio locale tra i domini autorizzati di Authentication se necessario (`localhost` è normalmente già incluso).

### Nota di sicurezza

Le regole Firestore incluse nel progetto permettono lettura e scrittura a chiunque:

```js
match /projects/{projectId} {
  allow read, write: if true;
}
```

Vanno bene per un prototipo, **non per la produzione**. Prima di pubblicare un'app reale, restringi le regole all'utente autenticato e ai collaboratori del progetto.

---

## Database SQL (Supabase)

Oltre a Firebase, l'app può usare un database **Postgres** su
[Supabase](https://supabase.com) come backend SQL, restando ospitata su GitHub
Pages. È la modalità consigliata per la sincronizzazione multi-dispositivo.

Attivazione: imposta `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
(vedi `.env.example`). Con queste variabili presenti l'app usa Supabase per login
e progetti, con IndexedDB come cache offline e coda di sincronizzazione.

Guida completa, schema SQL e configurazione GitHub Pages:
**[SUPABASE.md](./SUPABASE.md)** — lo schema è in
[`supabase/schema.sql`](supabase/schema.sql).

---

## Build di produzione

```bash
npm run build      # build con Firebase (produzione)
npm run preview    # anteprima della build su http://localhost:4173
```

Per provare una build in modalità locale:

```bash
npm run build:local
npm run preview:local
```

Output della build: cartella `dist/`.

### Deploy su Vercel

- Build command: `npm run build`
- Output directory: `dist`
- Non impostare `VITE_LOCAL_MODE=true` in produzione, altrimenti l'app userà il browser invece di Firebase.

---

## Struttura del progetto

```
App.tsx                       Login, dashboard e routing tra le viste
index.tsx                     Entry point React
types.ts                      Tipi condivisi (Project, WBSNode, CostItem, SAL, ...)
components/
  Editor.tsx                  Editor principale del computo
  WBSTree.tsx                 Albero delle categorie WBS
  PriceBookPanel.tsx          Gestione prezzari (import PDF/Excel/JSON)
  SALManager.tsx              Stati avanzamento lavori
  PrintPreview.tsx            Anteprima e stampa PDF
  TeamManagementModal.tsx     Condivisione e permessi
services/
  mode.ts                     Selezione modalità locale/cloud/Supabase
  auth.ts                     Autenticazione (locale, Firebase o Supabase)
  storage.ts                  CRUD progetti (locale, Firestore o Supabase)
  localProjects.ts            Archivio progetti in IndexedDB
  supabase.ts                 Client Supabase
  supabaseProjects.ts         CRUD progetti su Postgres + cache e coda offline
  firebase.ts                 Inizializzazione Firebase
supabase/schema.sql           Tabelle, indici, trigger e policy RLS
.github/workflows/deploy.yml  Build e deploy su GitHub Pages

```

---

## Dati locali

In modalità locale i progetti sono salvati in **IndexedDB** (database
`edilestimator_files`: store `projects`, `priceBooks`, `attachments`, `versions`,
`syncQueue`). In `localStorage` restano solo sessione e preferenze:

| Chiave | Contenuto |
| --- | --- |
| `edil_local_session` | Utente attualmente autenticato in locale |
| `edil_editor_sidebar_width` | Larghezza della sidebar dell'editor |
| `edil_uoms` | Unità di misura personalizzate |

Per cancellare tutto, dalla console del browser:

```js
localStorage.clear();
location.reload();
```

Per cancellare solo i progetti:

```js
indexedDB.deleteDatabase('edilestimator_files');
location.reload();
```

> La modalità locale usa IndexedDB (centinaia di MB disponibili), non più il
> limite di ~5 MB del localStorage.

> Il `localStorage` è legato all'origine (protocollo + host + porta): i dati creati su `http://localhost:3000` non compaiono su `http://localhost:4173`.

---

## Comandi disponibili

| Comando | Descrizione |
| --- | --- |
| `npm run dev` | Dev server in modalità locale |
| `npm run dev:cloud` | Dev server collegato a Firebase |
| `npm run build` | Build di produzione con Firebase |
| `npm run build:local` | Build di produzione in modalità locale |
| `npm run preview` | Anteprima della build |
| `npm run preview:local` | Anteprima della build locale |
| `npm run lint` | Controllo TypeScript (`tsc --noEmit`) |

---

## Note tecniche

- Tailwind CSS è compilato localmente tramite PostCSS: non serve più il CDN.
- PDF.js è installato come dipendenza npm e il worker viene servito da Vite: funziona offline.
- L'editor salva automaticamente il progetto circa un secondo dopo ogni modifica.
- In modalità cloud i campi complessi del progetto vengono serializzati in JSON su Firestore per evitare limiti di annidamento e chiavi con punti (email).

---

## Deploy (GitHub + Railway)

L'app è una SPA senza backend: su Railway viene servita da `server.mjs`.
Istruzioni complete in **[DEPLOY.md](./DEPLOY.md)**.

In breve:

```bash
npm run build:local   # build con dati nel browser (IndexedDB)
PORT=4173 npm start   # stessa modalità usata su Railway
```

Su Railway: *New Project → Deploy from GitHub repo*, variabile `VITE_LOCAL_MODE=true`
per la modalità locale, poi *Generate Domain*.

---

## Risoluzione problemi

**La porta 3000 è occupata**

Vite sceglie automaticamente la porta successiva (es. 3001). In alternativa chiudi il processo che occupa la porta e riavvia.

**`node` o `npm` non riconosciuti**

Installa Node.js LTS da <https://nodejs.org/> e riapri il terminale.

**La modalità cloud non fa login**

Verifica che Email/Password e Google siano abilitati nella console Firebase, che `localhost` sia tra i domini autorizzati e che le regole Firestore consentano l'accesso.

**Spazio locale esaurito**

Svuota i dati locali (vedi sopra) o passa alla modalità cloud.
