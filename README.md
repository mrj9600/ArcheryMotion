# ArcheryMotion

En app til at analysere bueskytters form: bevægelser, timing og alignment, målt med bevægelsessensorer (WitMotion, MantisX) og senere video. Den er lavet til skive, felt og 3D. Vision og plan står i [docs/vision-og-plan.md](docs/vision-og-plan.md).

**Status:** Feltoptager v1. Den har skytteprofiler og udstyr, optager rådata fra 1–4 sensorer over Web Bluetooth, finder skud automatisk, lader dig mærke hvert skud (op/lige/ned, afstand, greb/crawl, selvvurdering) og eksporterer som `.amrec` ([format](docs/optagelsesformat.md)). Prototypen med 3D-bue og sigtespor ligger i git-tagget `v0-prototype`.

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
