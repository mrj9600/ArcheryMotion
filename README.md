# ArcheryMotion

En app til at analysere bueskytters form: bevægelser, timing og alignment, målt med bevægelsessensorer (WitMotion, MantisX) og senere video. Den er lavet til skive, felt og 3D. Vision og plan står i [docs/vision-og-plan.md](docs/vision-og-plan.md).

**Status:** Feltoptager v1. Den har skytteprofiler og udstyr, optager rådata fra 1–4 sensorer over Web Bluetooth, finder skud automatisk, lader dig mærke hvert skud (op/lige/ned, afstand, greb/crawl, selvvurdering) og eksporterer som `.amrec` ([format](docs/optagelsesformat.md)). Den første træningsøvelse er en holdeøvelse (Holding SPT). Tiden starter automatisk ved fuldt træk, du får bip ved slut og når formen bryder sammen, og udsving, rystelse og drift vises pr. gentagelse. Under **Analyse** åbner du en optagelse fra enheden eller en `.amrec`-fil og ser alle sensorernes kurver på en fælles tidsakse, med skud og hold markeret. Skud- og holdedetektionen kan køres igen med andre grænser, så de kan justeres efter rigtige data. Prototypen med 3D-bue og sigtespor ligger i git-tagget `v0-prototype`.

## Brug på mobilen

Appen ligger på **https://mrj9600.github.io/ArcheryMotion/** og opdateres automatisk ved hvert push til `main`. Åbn den i Chrome på Android og vælg *Installér app* / *Føj til startskærm*. Derefter virker den også uden net i felten.

## Kør lokalt

```bash
npm install
npm start
```

Åbn http://localhost:4200 i Chrome eller Edge. Web Bluetooth findes ikke i Safari på iPhone/iPad.

Til mobilen på samme netværk (https er krævet for Bluetooth):

```bash
npm run start:lan
```

Åbn `https://<pc'ens-ip>:4200` i Chrome på Android og godkend det selvsignerede certifikat.

## Test og build

```bash
npm test
npm run build
```
