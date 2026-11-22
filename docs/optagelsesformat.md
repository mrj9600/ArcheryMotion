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
