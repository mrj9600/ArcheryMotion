# MantisX BLE-protokol – arbejdsnoter

Status: opstart og dataformat kendt (fra appens parser); gyro x verificeret mod WitMotion, gyro z kun delvist.

Kilder:
- `mantis674-log-2026-11-20T18-18-18-867Z.txt`: ArcheryMotion BLE-udforsker, ca. 58 s notify på 6e400003 **uden** opstart.
- `btsnoop_hci_202611201936.cfa`: Samsung HCI snoop-log (standard btsnoop v1, H4) af den officielle MantisX-app: forbind, Calibrate, træning (~30 s).

## Enhed

- Navn: `mantis674`, adresse `C7:29:B5:E7:76:75`
- Device Information: serienummer (2a25) `07020400108674`, firmware (2a26) `04`, hardware (2a27) `02`. Batteri (2a19) var 0x27 = 39 %.

## GATT (fra HCI-loggen)

| Handle | UUID | Egenskaber | Bemærkning |
|-------:|------|-----------|------------|
| 18–36 | service `6e400001-204d-616e-7469-732054656368` | | " Mantis Tech" |
| 20 | `6e400002-…` | write, writeNoResp | (ikke brugt af appen) |
| 22 | `6e400003-…` | notify | data |
| 25 | `6e400004-…` | read, write | |
| 27 | `6e400005-…` | read, write | **pakkekode**: appen skriver 5 (eller 6 i en anden tilstand; 2 for 200-Hz-typen 'E') |
| 29 | `6e400006-…` | read, write | **samplingstilstand**: 4 = "400 samples" (3 på nogle enheder; 7/9 = 200 samples) |
| 31 | `6e400009-…` | read, write | |
| 33 | `6e40000d-…` | read, write | appen kalder den "location"; læst `00`, skriver `02` |
| 35 | `6e40000a-…` | read, write, notify | **kalibrering** (appen kalder det "Calibration"); skriver `01`, får notify `00` |
| 37–40 | service `fe59` | | **Nordic Secure DFU – skriv aldrig hertil** |
| 39 | `8ec90003-f315-4f60-9fb8-838830daea50` | write, indicate | DFU buttonless |

UUID-suffikset for alle MantisX-characteristics er `-204d-616e-7469-732054656368`.

## Opstartssekvens (MantisX-appen)

1. Slå notify til på `6e40000a` (CCCD `01 00`).
2. Læs 2a25, 2a26, 2a27 og 2a19 (info og batteri).
3. Skriv `6e40000d = 02`.
4. Skriv `6e40000a = 01`. Svaret er en notify `00` på 0a.
5. Skriv `6e400005 = 05`.
6. Skriv `6e400006 = 04`.
7. Slå notify til på `6e400003`.

Appen gentager trin 5–7 én gang. Den stopper notify efter ~3 s og starter igen (sammen med 5–6) ved ~7 s, sandsynligvis Calibrate og derefter start af træning.

Alle skrivninger er "write with response" med 1 byte.

## Notify-pakker på 6e400003

Altid 76 bytes, ca. 33–35 pakker/s:

| Bytes | Indhold |
|------|---------|
| 0 | `0x48` ('H') |
| 1 | pakketæller, laveste byte |
| 2–73 | 6 blokke × 12 bytes |
| 74 | ekstra byte (appen gemmer den pr. sample; i loggene = tællerens værdi) |
| 75 | statusbyte; `0xff` = ingen hændelse, ellers en hændelseskode |

Pakketælleren er kun 8 bit (byte 1). I loggene er der ingen tabte pakker.

Kilde til formatet nedenfor: MantisX Archery-appen (`com.roberts.croberts.mantis.archery`), udpakket med jadx til eget brug for interoperabilitet. Parseren for pakketype `'H'` (76 bytes, 6 blokke) og `'I'` (148 bytes, 12 blokke). Beskrevet her med egne ord; appens kode er ikke kopieret ind i projektet.

### Blok (12 bytes) = 2 samples + vinkler

Blokken læses som 8 felter à 12 bit, nibbles big-endian (`abc def ghi jkl mno pqr stu vwx`):

| Felt | Indhold | Afkodning |
|------|---------|-----------|
| 1, 4 | sample A/B: **accelerationsstørrelse** | `|F(v)| · 16/32768` g |
| 2, 5 | sample A/B: **gyro x** | `F(v) · skala` °/s |
| 3, 6 | sample A/B: **gyro z** | `F(v) · skala` °/s |
| 7 | **pitch** (alle samples i blokken) | se nedenfor |
| 8 | **roll** | se nedenfor |

Sample A = felt 1–3, sample B = felt 4–6, dvs. 2 samples pr. blok, 12 pr. pakke, nominelt **400 Hz**. Målt: 28,3 pakker/s ≈ 340 Hz. Gyro y (rotation om løbet/pilens akse) sendes **ikke** i denne tilstand.

**F(v), 12-bit "minifloat"** (3 bit eksponent `e` = v >> 9, 9 bit mantisse `m` = v & 0x1ff):
1. `m` tolkes som 9-bit signeret (`m ≥ 256 → m − 512`).
2. Hvis `e > 0`: læg den skjulte bit til, altså `m = m XOR 256` (for negative: størrelsen øges med 256 og fortegnet bevares), og `e = e − 1`.
3. `d = 256 >> (9 − e)`; hvis `d > 0`: `d = d − 0.5` (afrundingskorrektion).
4. Resultat = `m · 2^e + d`. Område ca. ±32768, som en 16-bit IMU-værdi.

**Skalering:** appen ganger acceleration med 16/32768 (±16 g) og gyro med 2000/32768. Sammenlignet med WIT passer gyro x dog bedst med **1000/32768** (koefficientlængde 0,996, R = 0,84). Muligvis halveres værdien et andet sted i appen (kalibreringstrin), eller sensoren kører ±1000 °/s. Brug 1000/32768 indtil andet er vist.

**Vinkler (felt 7/8, 12-bit unsigned):**
- Pitch: `p = v7/4095 · R`, hvor `R = 180` når sensorens hardware-/firmwareversion ≥ 4 (vores: 04), ellers 360. Hvis `p > R/2`: `p −= R`. Appen bruger `−p` som pitch.
- Roll: `r = v8/4095 · 360`; hvis `r > 180`: `r −= 360`.
- ArcheryMotion bruger `+p` (dvs. modsat appen) som pitch i Z-Y-X-konventionen. Det er bekræftet med en rigtig sensor: med appens fortegn var op/ned omvendt i 3D.
- Appen justerer desuden efter monteringen (top/bund/venstre/højre) og for venstrehåndede. Det klarer vores egen nulstilling.

### Verifikation mod WitMotion (log `mantis674+WTMRJ-log-2026-11-20T18-56-07-306Z.txt`)

MantisX og WIT (200 Hz) tapet sammen og bevæget i ca. 25 s:
- Gyro x (felt 2) passer med WIT's x-akse: R = 0,84, skala 1000/32768, tidsforskydning 0,02 s.
- Gyro z (felt 3) følger hurtige ændringer, men ikke en jævn grunddrejning (WIT viste −155 °/s, MantisX ≈ 0). Det tyder på, at firmwaren højpasfiltrerer gyroen eller løbende fjerner langsom drejning. R = 0,35.
- Gyro x ser ud til at mætte omkring ±255 °/s i denne optagelse.
- Roll korrelerer 0,76 med WIT-roll.

Tidligere blinde hypoteser (12-bit, eksponent uden skjult bit, delta, acceleration) er forkastet. Den rigtige afkodning er F(v) ovenfor.

I tomgang (tilstand 3, uden opstart) er strømmen næsten konstant og stille. Den reagerer kun på kraftige bevægelser.

## Næste skridt

1. Skriv en `MantisXDriver` (`SensorDriver`): opstartssekvens, pakketype H, F(v)-afkodning, pitch/roll som orientering, gyro x/z og accelerationsstørrelse i `MotionSample`.
2. Afklar gyroskala og -filtrering: drej sensoren præcis 90° om hver akse (langsomt og hurtigt) sammen med WIT.
3. Brug accelerationsstørrelsen (felt 1) til slip-detektion.

## Appens analyse (fra MantisX Archery-appens kode, beskrevet med egne ord)

### Live-sporet (højre/venstre og op/ned)
- Sporet er **integreret gyro**: højre/venstre = løbende sum af gyro z · dt, op/ned = løbende sum af gyro x · dt (dt = 1/400 s), i grader.
- Det er derfor, appen kan tegne højre/venstre, selvom sensoren ikke sender en retning (yaw). Driften holdes nede, fordi kun de seneste sekunder vises, og sensoren filtrerer langsom drejning fra.

### Faser (beregnes baglæns fra slippet)
Sporet nedsamples til hvert 4. sample (~100 Hz), undtagen 20 samples før og 50 efter slippet. Alle punkter regnes relativt til sporets position ved slippet (grader).
1. **HOLD**: den sammenhængende periode lige før slippet, hvor sigtet er inden for **2°** af slippunktet.
2. **TARGET**: før HOLD, så længe sigtet er inden for **5°** af slippunktet.
3. **DRAW**: fra sporets højeste punkt og ned til 5°-grænsen. Søgningen baglæns stopper, når buen er mere end 30° under slippunktet.
4. **SETUP**: alt før DRAW. Skuddets start skæres, hvor buen pegede mere end 25° nedad (sensorens pitch < −25°).
5. **RELEASE**: efter slippet, indtil appen vurderer, at pilen har forladt buen.

CSV-eksporten har kolonnerne Setup-upward (blå), Setup-downward (grøn), Targeting (gul) og Hold (orange). Det passer sandsynligvis med SETUP, DRAW, TARGET og HOLD, og tallene er sandsynligvis varigheder i sekunder (appen gemmer `archery_*_time`). Ikke bekræftet.

### Stability Score (0–100)
Beregnes separat for op/ned og højre/venstre, og scoren er gennemsnittet af de to (kun dem, der er > 0):
1. Vindue: fra HOLD-start til slippet, højst de sidste 300 punkter (~3 s).
2. For hvert punkt: hvor meget sigtet flyttede sig siden forrige punkt på den akse (grader). Kun skridt under 0,1° tages med; er der ingen, fordobles grænsen (op til 10 gange).
3. Skridtene sorteres, og de **største 25 %** bruges (hvis der er over 10).
4. Hvert skridt vægtes med, hvor tæt på slippet det er (0 ved HOLD-start, 1 ved slippet), og der tages gennemsnit.
5. Score = 100 − 1200 · gennemsnit. Under 10 omregnes til (score + 50)/6, så den aldrig bliver negativ.

Eksempel: et vægtet gennemsnit på 0,01° pr. skridt giver 88.

### Øvrige mål pr. skud (fælles kode for alle våbentyper)
- `trigger_hold`: halv diagonal af sporets udbredelse 0,75–0,15 s før skuddet.
- `trigger_pull`: det samme for de sidste 0,15 s.
- Retning ("Problem Direction"): retningen fra gennemsnittet 0,2–0,1 s før skuddet til punktet lige før skuddet.
