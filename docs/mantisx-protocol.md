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

**Skalering:** acceleration ganges med 16/32768 (±16 g). Gyro ganges med **0,07 °/s pr. enhed** (fuldt område 2293,76 °/s). Det er den almindelige følsomhed for en gyrochip på ±2000 °/s, mens appen bruger 2000/32768, som giver 13 % for lidt.

Sådan blev det fundet:
- *23. november:* 1000/32768 blev valgt ud fra en sammenligning med WIT. Den sammenligning var forkert, fordi WIT-sensoren gav forkerte data indtil en fabriksnulstilling.
- *24. november:* feltoptagelserne viste, at gyro x lagt sammen over rolige bevægelser passer med sensorens egen pitch med en faktor 2,06–2,20 i forhold til 1000/32768. Skalaen blev derfor sat til appens 2000/32768.
- *25. november:* MantisX og den nulstillede WIT blev sat fast på samme bue, og buen blev vippet, tippet og drejet (optagelsen `archerymotion_Martin_2026-11-25_1755`). WIT's gyro passer med vinklen mellem tyngdekraftens retning før og efter (inden for ca. 2 %), så den kan bruges som facit. MantisX med 2000/32768 viste 13–17 % for lidt ved alle hastigheder over 5 °/s, med korrelation 0,99. Med 0,07 °/s er forholdet 0,99–1,01 (fx drejning mod venstre 100,9° mod WIT 99,2°, mod højre 169,4° mod 170,9°).

`session.sensors[].gyroFullScale` siger, hvilken skala en optagelse er lavet med: mangler den, var det 1000, og fra 24.–25. november står der 2000. Ældre optagelser regnes om til 2293,76, når de åbnes (`correctGyroScale`), også holdeøvelsens udsving og rystelse. Grænserne i °/s (hold, pause, måler) er ganget med 2,29 fra de første indstillinger, så appen opfører sig som før.

Andet fra sammenligningen 25. november:
- Gyro z bliver **ikke** højpasfiltreret. Langsomme drejninger på 5–15 °/s passer også (det modsatte stod nedenfor fra den gamle WIT-sammenligning).
- MantisX' tid ligger ca. 20 ms efter WIT's. Det betyder noget, når slippet skal sammenlignes mellem bue og arm.
- **Tidsfejl 24.–25. november 2026 (build 37–48):** MantisX holder op med at sende, når den ligger stille, og fortsætter bagefter med næste pakkenummer. Rettelsen for data, som telefonen holdt tilbage (`BACKLOG_MS`), troede så, at pakkerne var holdt tilbage, og satte resten af optagelsen i forlængelse af de sidste målinger før stilheden. MantisX' tid kom derfor 1–19 s for tidligt i forhold til WIT og til skuddenes rigtige tid, og forskellen voksede (fx `1910`: 18,0 s ved skud 1 og 18,8 s ved skud 4). Bue-analysen alene er ikke påvirket, men bue og arm kan ikke sammenlignes direkte. Skuddene kan parres ved at finde rystet i slippet i begge sensorer. Nu skelner `PacketClock` de to tilfælde: tilbageholdte pakker kommer langt hurtigere end i virkeligheden og indhenter forsinkelsen, mens en sensor, der sender igen efter stilhed, ikke gør.
- Nulpunkt: når buen ligger stille, viser MantisX gyro z ca. −0,3 °/s og gyro x ca. 0. Det er 0,1° over et slip, men mere over et langt hold.

**Vinkler (felt 7/8, 12-bit unsigned):**
- Pitch: `p = v7/4095 · R`, hvor `R = 180` når sensorens hardware-/firmwareversion ≥ 4 (vores: 04), ellers 360. Hvis `p > R/2`: `p −= R`. Appen bruger `−p` som pitch.
- Roll: `r = v8/4095 · 360`; hvis `r > 180`: `r −= 360`.
- ArcheryMotion bruger `+p` (dvs. modsat appen) som pitch i Z-Y-X-konventionen. Det er bekræftet med en rigtig sensor: med appens fortegn var op/ned omvendt i 3D.
- Appen justerer desuden efter monteringen (top/bund/venstre/højre) og for venstrehåndede. Det klarer vores egen nulstilling.

### Verifikation mod WitMotion (log `mantis674+WTMRJ-log-2026-11-20T18-56-07-306Z.txt`)

MantisX og WIT (200 Hz) tapet sammen og bevæget i ca. 25 s:
- Gyro x (felt 2) passer med WIT's x-akse: R = 0,84, skala 1000/32768, tidsforskydning 0,02 s. **Skalaen her er forkert**: WIT-sensoren gav forkerte data (værdier over 2 g i ro, tal der frøs og sprang til 0) indtil en fabriksnulstilling. Sammenligningen er lavet om 25. november (se Skalering).
- Gyro z (felt 3) følger hurtige ændringer, men ikke en jævn grunddrejning (WIT viste −155 °/s, MantisX ≈ 0). Det tydede på et højpasfilter, men det holdt ikke med den nulstillede WIT (se Skalering).
- Gyro x ser ud til at mætte omkring ±255 °/s i denne optagelse.
- Roll korrelerer 0,76 med WIT-roll.

Tidligere blinde hypoteser (12-bit, eksponent uden skjult bit, delta, acceleration) er forkastet. Den rigtige afkodning er F(v) ovenfor.

I tomgang (tilstand 3, uden opstart) er strømmen næsten konstant og stille. Den reagerer kun på kraftige bevægelser.

## Næste skridt

1. Skriv en `MantisXDriver` (`SensorDriver`): opstartssekvens, pakketype H, F(v)-afkodning, pitch/roll som orientering, gyro x/z og accelerationsstørrelse i `MotionSample`.
2. ~~Bekræft gyroskala og -filtrering med den fabriksnulstillede WIT.~~ Gjort 25. november (se Skalering).
3. Brug accelerationsstørrelsen (felt 1) til slip-detektion.

## Buens akser (fundet fra feltoptagelserne)

MantisX sidder på buen med sin y-akse langs pilen. Fundet ved at prøve de 8 mulige retninger for gyro x og z og se, hvilken der får gyroen til at passe med, hvordan pitch ændrer sig (med cant regnet med). Testet på optagelserne fra 23. og 24. november 2026:

| Gyro | Buens akse | Positiv betyder |
|------|-----------|-----------------|
| x | sideaksen | buen drejer **op** (toppen mod skytten) |
| y | pilens akse | sendes ikke |
| z | lodret akse | buen drejer mod **højre**, set fra skytten |

- Gyro x som sideakse er tydelig: korrelation 0,69–0,71 med pitch, mod 0,09–0,18, hvis x og z byttes. Det passer med appen, der bruger gyro x til op/ned og gyro z til højre/venstre (se nedenfor). Retningen er bekræftet 25. november: WIT's tyngdekraft viser, at buen peger op, når MantisX' pitch er negativ (se nedenfor).
- Retningen for gyro z blev først fundet gennem cant (korrelation 0,71 mod 0,61 med modsat fortegn). Den er bekræftet 25. november: da buen blev drejet 90° mod venstre, var gyro z negativ, og WIT's retning (yaw) steg med 99°, altså mod uret set ovenfra.
- Roll positiv = toppen hælder til højre (kant-test, se [optagelsesformat.md](optagelsesformat.md)).
- **Pitch positiv = buen peger nedad (toppen væk fra skytten).** Det passer med 3D-visningen og simulatoren, men i en periode (24.–25. november) regnede analysen det forkert som opad. Rettet efter to ting: med buen stillet op ad en væg, pegende ca. 20° nedad (som ved et skud ned ad bakke, skyttens beskrivelse), viste MantisX +20°. Og WIT's tyngdekraft viser pilens akse 40° opad, når MantisX viser −52°, og 51° nedad ved +40° (retningen for WIT's pilakse er fundet fra cant-bevægelserne og den bekræftede cant-retning).
- I slippet drejer buen **op** (toppen mod skytten): ca. 7–13° de første 0,25 s i optagelsen fra 24. november (pitch falder, gyro x er positiv). Det modsiger umiddelbart BEST, hvor buen "tipper frem" i follow-through. Det er ikke afklaret, om det er buens første reaktion i slippet (før slyngen griber), eller om noget i tolkningen stadig er forkert.

`src/app/workbench/bow-motion.ts` regner buens drejning op/ned og venstre/højre ud fra gyro x og z, roll og pitch, så en bue med cant stadig viser venstre som venstre. Drejning om pilens akse mangler (gyro y), så venstre/højre er kun god, når buen peger inden for ca. ±30° af vandret.

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
