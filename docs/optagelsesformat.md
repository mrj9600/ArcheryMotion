# Optagelsesformat (.amrec)

En session eksporteres som én fil, `archerymotion_<skytte>_<dato>_<tid>.amrec`. Formatet er lavet til at kunne læses offline (analysebænken, Python osv.).

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

Er sessionen en holdeøvelse, har `session.drill` indstillingerne og én række pr. gentagelse:

```json
"drill": { "kind": "hold", "holdSeconds": 30, "reps": 5, "restSeconds": 30,
  "results": [{ "number": 1, "start": 4210, "end": 34890, "heldMs": 30680, "goodFormMs": 24000, "completed": true,
                "startedBy": "auto", "endedBy": "auto", "sway": 1.8, "tremor": 0.6, "drift": 1.2,
                "warnings": [28210], "perSecond": { "sway": [3.1, 1.6, 1.5], "tremor": [0.5, 0.4, 0.5] } }] }
```

- `start`/`end` er sessionstid (ms). Holdet starter, når buen har bevæget sig (løftet og trukket) og derefter ligger roligt i 0,8 s. Det slutter, når buen igen bevæger sig hurtigt (nedtræk eller skud).
- `sway` (udsving) er den langsomme del af buens vinkelhastighed og `tremor` (rystelse) den hurtige del (over ca. 1,6 Hz), begge i °/s som RMS. `perSecond` har dem for hvert hele sekund af holdet.
- Sekund 1–2 er skyttens eget udgangspunkt. Bliver udsving eller rystelse tydeligt større to sekunder i træk, bryder formen sammen: `warnings` har tidspunktet, hvor det begyndte, og `goodFormMs` er tiden indtil første gang.
- `drift` er den største ændring af buens hældning og cant (roll/pitch) i forhold til første sekund, i grader. Mangler, hvis sensoren ikke sender vinkler.
- Grænserne står i `src/app/training/hold-detector.ts` (`HOLD_LIMITS`) og er første bud. De skal justeres efter rigtige optagelser.

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

Vektorer ligger flettet: `x0 y0 z0 x1 y1 z1 ...`. Manglende værdier er `NaN`. Felter, som en sensor aldrig sender, er udeladt. MantisX sender fx ikke gyro y (står som 0) og ingen yaw.

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
