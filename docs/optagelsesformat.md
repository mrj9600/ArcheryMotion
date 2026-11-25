# Optagelsesformat (.amrec)

En session eksporteres som én fil, `archerymotion_<skytte>_<dato>_<tid>.amrec`. Når den deles fra telefonen, hedder den `.amrec.txt`, fordi Androids delingsmenu kun tager visse filtyper. Indholdet er det samme. Under Optagelser → Importér… kan filerne lægges ind i appen på en anden enhed (flere ad gangen); skytte og udstyr følger med, og optagelser, der allerede findes, springes over. Formatet er lavet til at kunne læses offline (analysebænken, Python osv.).

Hele filen er **gzip-komprimeret**. Udpakket ser den sådan ud:

| Del | Indhold |
|-----|---------|
| 7 bytes | `AMREC1\n` |
| 4 bytes | uint32 little endian: længden af headeren i bytes |
| header | UTF-8 JSON (se nedenfor) |
| data | rå arrays, little endian, efter hinanden |

## Header

```json
{
  "format": "archery-motion-recording",
  "version": 1,
  "exportedAt": 1795370000000,
  "session": { "id": "...", "archerId": "...", "setupId": "...", "startedAt": 1795369980000, "endedAt": ..., "place": "...",
               "sensors": [{ "index": 0, "name": "WT901BLE68", "kind": "witmotion-ble", "role": "bow" }], "shotCount": 2, "sampleCount": 2863 },
  "archer": { "name": "...", "bowType": "barebow", "handedness": "right" },
  "setup": { "name": "...", "bowType": "barebow", "drawWeight": 32, "weights": "..." },
  "shots": [{ "number": 1, "releaseTime": 9037, "trigger": "auto", "target": "level", "distance": 25, "crawl": "3 sting", "selfRating": "good", "discarded": false }],
  "streams": [{ "sensorIndex": 0, "field": "t", "type": "f64", "components": 1, "offset": 0, "byteLength": 22904 }]
}
```

- Alle tider (`t`, `releaseTime`) er **ms efter `session.startedAt`** (epoch ms).
- `t` er tidspunktet, hvor mobilen modtog målingen (`performance.now()`). For MantisX er målingerne i en pakke fordelt jævnt bagud fra modtagetidspunktet.
- `shots[].discarded = true` betyder, at skytten har markeret det som en fejludløsning.

## Holdeøvelse

Hvert skud kan senere få `arrow` (pilens nummer eller navn) og `impact`, hvor pilen sad. Det kan endnu ikke indtastes i appen, men formatet er klar:

```json
"impact": { "x": 4.5, "y": -2, "direction": "downRight", "score": "8", "missed": false, "targetSize": 40, "markedAt": 1795420000000 }
```

- `x`/`y` er afstanden i cm fra det punkt, skytten sigtede på, set fra skytten: `x` positiv til højre, `y` positiv op. Sammen med `distance` giver det vinklen, pilen ramte ved siden af, og den kan sammenlignes direkte med sensorernes vinkler.
- `face` er placeringen på skiven som i ArrowPlot og MyTargets (i forhold til skivens radius, `x` til højre, `y` ned), og `ring` er zonen (0 = inderst, -1 = forbi). De gør det muligt at hente placeringer fra ArrowPlot. Sigter skytten ikke på midten (gap eller point-on), er `face` ikke det samme som `x`/`y`.
- `direction` er en grov retning (`center`, `up`, `down`, `left`, `right`, `upLeft`, `upRight`, `downLeft`, `downRight`), når den præcise placering ikke er sat.
- `score` er point eller zone som skrevet ned. `targetSize` er skivens eller dræbezonens størrelse i cm.
- Alle felter er valgfrie. Skuddets `releaseTime` binder placeringen sammen med sensordata.

`session.pauses` er perioder, hvor der ikke blev gemt data: `{ "start": 151200, "end": 190300, "by": "auto" }` (sessionstid i ms). `auto` betyder, at buen havde ligget helt stille i 10 s (sat fra sig); optagelsen fortsatte, da buen blev taget op, og de sidste 2 s før blev gemt med. `manual` er pauseknappen. Under en pause findes der heller ingen skud.

`session.dropouts` er perioder, hvor en sensor havde mistet forbindelsen, og appen prøvede at forbinde igen: `{ "sensorIndex": 0, "start": 151200, "end": 182900 }` (sessionstid i ms; `end` mangler, hvis sensoren aldrig kom tilbage). Der er ingen data fra den sensor i perioden.

`session.app` er den app-version, der lavede optagelsen: `{ "build": 27, "commit": "a1b2c3d", "date": "2026-11-23T10:05:00+01:00" }`. `build` er antallet af commits og stiger for hver ny version; `0` betyder en lokal udviklingsbygning. Mangler feltet, er optagelsen lavet før versionen blev gemt.

Har skytten valgt et fokus for sessionen, står det i `session.focus`, fx `{ "key": "release", "label": "Slip og follow-through" }`. Nøglerne er `release`, `expansion`, `cant`, `bowArm`, `anchor`, `tempo`, `slope` og `other` (så er `label` skyttens egen tekst). Skuddenes `selfRating` (`good`/`bad`) er skyttens vurdering af, om fokuspunktet lykkedes i skuddet, ikke hvor pilen ramte.

Er sessionen en holdeøvelse, har `session.drill` indstillingerne og én række pr. gentagelse:

```json
"drill": { "kind": "hold", "holdSeconds": 30, "reps": 5, "restSeconds": 30,
  "results": [{ "number": 1, "start": 4210, "end": 34890, "heldMs": 30680, "goodFormMs": 24000, "completed": true,
                "startedBy": "auto", "endedBy": "auto", "sway": 1.8, "tremor": 0.6, "drift": 1.2,
                "warnings": [28210], "perSecond": { "sway": [3.1, 1.6, 1.5], "tremor": [0.5, 0.4, 0.5] } }] }
```

- `start`/`end` er sessionstid (ms). Holdet starter, når buen har bevæget sig (løftet og trukket) og derefter ligger roligt i 0,8 s. Buen skal også pege som ved fuldt træk (fra niveautrinnet eller fra seneste skud): cant inden for 20°, højst 10° højere og højst 30° lavere. Opsætningen før trækket er 15–22° højere og tæller derfor ikke. Holdet slutter, når buen igen bevæger sig hurtigt eller langsomt flytter sig mere end 10° (nedtræk), eller ved et skud.
- Et hold, der slutter af sig selv inden for 2,5 s (højst halvdelen af måltiden), var ikke et hold, men buen holdt stille under opsætningen. Det gemmes ikke, og gentagelsen venter på det rigtige hold (en dyb bip). Slutter et hold af sig selv før måltiden, venter appen 4 s: ligger buen roligt i fuldt træk igen inden da, var det første opsætningen, og det nye hold erstatter det.
- `endedBy` er `auto` (nedtræk), `manual` (knappen) eller `shot` (skytten skød i stedet for at tage ned).
- `sway` (udsving) er den langsomme del af buens vinkelhastighed og `tremor` (rystelse) den hurtige del (over ca. 1,6 Hz), begge i °/s som RMS. `perSecond` har dem for hvert hele sekund af holdet.
- Sekund 1–2 er skyttens eget udgangspunkt. Bliver udsving eller rystelse tydeligt større to sekunder i træk, bryder formen sammen: `warnings` har tidspunktet, hvor det begyndte, og `goodFormMs` er tiden indtil første gang.
- `drift` er den største ændring af buens hældning og cant (roll/pitch) i forhold til første sekund, i grader. Mangler, hvis sensoren ikke sender vinkler.
- Grænserne står i `src/app/training/hold-detector.ts` (`HOLD_LIMITS`). De er sat efter de første optagelser fra banen (barebow med MantisX på buen, 23. november 2026).

## Streams

Hver stream er ét array for én sensor. `offset` regnes fra starten af datadelen.

| field | type | components | enhed |
|-------|------|-----------|-------|
| `t` | float64 | 1 | ms |
| `acc` | float32 | 3 (x y z) | g, inkl. tyngdekraft |
| `gyro` | float32 | 3 | °/s |
| `euler` | float32 | 3 (roll pitch yaw) | grader, Z-Y-X |
| `quat` | float32 | 4 (x y z w) | |
| `accMagnitude` | float32 | 1 | g, uden tyngdekraft (MantisX) |

`session.sensors[].gyroFullScale` er gyroens fulde område i °/s, som værdierne er regnet om med (MantisX: 2293,76, dvs. 0,07 °/s pr. enhed). Mangler det på en MantisX, er optagelsen lavet før 24. november 2026 med 1000. Fra 24.–25. november står der 2000. Appen regner begge om til den rigtige skala, når optagelsen åbnes.

Vektorer ligger flettet: `x0 y0 z0 x1 y1 z1 ...`. Manglende værdier er `NaN`. Felter, som en sensor aldrig sender, er udeladt. MantisX sender fx ikke gyro y (står som 0) og ingen yaw.

MantisX' `euler` roll er buens cant: **positiv roll = toppen hælder til højre** set fra skytten. Det er målt med sensoren monteret som i optagelserne fra 24. november 2026, hvor toppen blev holdt tippet til højre i 11 s ved fuldt træk (roll +20 til +25°). For en højrehåndsskytte er cant mod pilens side altså negativ roll. Monteres sensoren anderledes, kan fortegnet vende.

## Læs i Python

```python
import gzip, json, struct, numpy as np

raw = gzip.open("fil.amrec", "rb").read()
assert raw[:7] == b"AMREC1\n"
n = struct.unpack_from("<I", raw, 7)[0]
header = json.loads(raw[11:11 + n])
data = raw[11 + n:]
streams = {}
for s in header["streams"]:
    arr = np.frombuffer(data, dtype="<f8" if s["type"] == "f64" else "<f4",
                        count=s["byteLength"] // (8 if s["type"] == "f64" else 4), offset=s["offset"])
    streams[(s["sensorIndex"], s["field"])] = arr.reshape(-1, s["components"]) if s["components"] > 1 else arr
```
