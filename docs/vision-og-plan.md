# ArcheryMotion – vision og første plan

Skrevet 21. november 2026 ud fra Martins beskrivelse. Prototypen i `src/` var den første udgave. Det, der skal bevares derfra, er viden: protokollerne (se `mantisx-protocol.md` og WitMotion-driveren) og hvordan MantisX-appen virker.

## 1. Opsummering

**Formål.** Appen skal analysere skyttens *form*, altså bevægelser, timing og alignment. Den handler om skytten og ikke om resultater.

**Ikke kun skive.** Den skal også kunne bruges til 3D og felt, hvor målet kan stå højt eller lavt. Vi vil gerne kunne se, om formen ændrer sig med målets højde, fx om hovedstillingen ændrer sig, når der skydes op eller ned.

**Både bue og skytte.** Det skal være et forholdsvis billigt system, der måler buens bevægelser og efterhånden også skyttens.

**To scenarier:**
1. **Kontrollerede forhold.** Der er plads til kameraer på stativ, typisk 2 almindelige mobiltelefoner, der optager med normal hastighed.
2. **I felten.** Kun det udstyr, der kan sidde på bue og skytte, plus en mobil eller tablet.

**Udstyr i alt.** Højst ca. 2 kameraer, 2–4 sensorer og én enhed at se det på. Det skal være billigt, let at bære og kunne læses i dagslys. Det må gerne være brugt, og Black Friday er fredag den 27. november.

**Feedback inden for 5 sekunder.** Resultatet skal stå foran skytten senest 5 s efter slippet, mens skuddet er frisk i kroppen.

*Tjekket mod forskningen i motorisk læring (22.11.2026):*
- **Grundidéen holder.** Kropsfornemmelsen af en bevægelse (proprioceptiv hukommelse) blegner hurtigt, inden for sekunder til et halvt minut. Den forstyrres især, hvis man laver noget andet imellem. Et studie fandt, at læringen blev dårligere, når tiden før feedback blev fyldt med en anden opgave.
- **Tallet 10 s er ikke en fast grænse.** Studierne er uenige om, hvor hurtigt det glemmes. Det afgørende er snarere, *om man laver noget andet* (sætter næste pil på, snakker), end antallet af sekunder.
- **Øjeblikkelig feedback kan skade læringen.** Swinnen m.fl. (1990): feedback, der kommer *øjeblikkeligt*, gør læringen dårligere, fordi skytten ikke når at mærke og vurdere skuddet selv først.
- **Feedback på hvert skud kan gøre en afhængig** (*guidance-hypotesen*): man lærer at stole på appen frem for sin egen fornemmelse. Beviserne er blandede, men en metaanalyse fandt en lille fordel ved mindre hyppig feedback på længere sigt.

*Konsekvens for designet:*
- Et kort **selvvurderingsvindue** på 1–3 s efter slippet. Skytten kan evt. selv give en vurdering ("føltes godt/skidt", tryk eller stemme). Derefter kommer feedback, senest efter ca. 5 s, og før næste pil.
- Valgfri **reduceret feedback**: fx kun når et mål er uden for skyttens normale område, kun hvert N'te skud, eller en opsummering efter hver runde. Det kan aftrappes, efterhånden som skytten bliver bedre.

Det betyder:
- Analysen skal køre **på mobilen med det samme**. Analysebænken på PC er kun til udvikling.
- Optagevinduet efter slippet holdes kort (ca. 1–1,5 s), og beregningen skal tage under 1 s.
- **Det vigtigste vises først**: 1–3 store tal eller en farve plus en kort lydbesked ("hold 4,2 s, stabil, buen faldt til venstre"). Detaljer og grafer kan åbnes bagefter.
- Lyd er vigtig, fordi skytten ikke altid kigger på skærmen lige efter skuddet.
- Video fra andre telefoner skal også nå frem hurtigt. ArcherFormReplay sender i forvejen korte klip efter slippet.

**Alle buetyper.** Appen skal understøtte recurve, barebow, compound, langbue og traditionel. Buetypen styrer, hvilke faser, øvelser og mål der giver mening (fx klikker kun for recurve, release-hjælp for compound).

**Skytteprofiler.** Én installation skal kunne bruges af flere skytter. Hver skytte har sin egen profil med optagelser, sin egen "normale form", kalibreringer og træningslog.

**Udstyr pr. skytte.** Hver skytte kan registrere flere opsætninger:
- bue: håndsektion, ben, trækvægt og træklængde
- vægte og stabilisatorer, og hvor de sidder
- pile og tiller

Hvert skud gemmes med den opsætning, der blev brugt. Så kan appen sammenligne opsætninger, fx hvad forskellige vægtkonfigurationer betyder for buens reaktion i slippet, holdets stabilitet og formen.

**Barebow.** Martin skyder barebow. Det betyder:
- **Ingen sigte.** Der sigtes med pilespidsen, string walking eller face walking, så ankeret og hvor man griber strengen kan variere mellem afstande. Et skud skal kunne mærkes med greb/crawl.
- **Ingen klikker** som standard, så slippet og ekspansionen skal findes ud fra bevægelsen alene.
- **Ingen lange stabilisatorer**, kun vægte i håndsektionen. Buen reagerer derfor anderledes i slippet end en olympisk recurve, og MantisX' tal er ikke nødvendigvis direkte sammenlignelige.

**Første fokus.** Grebet, altså den del af håndsektionen, man holder om. Dets bevægelser skal vises meget tydeligere end i den første udgave, hvor de var svære at se. Den 3D-tegnede bue og sigtesporet er ikke vigtige.

**Kalibrering.** Hvad skal skytten selv kalibrere, og hvad kan appen regne ud af data fra de første skud?

**Udvikling.** Vi starter med en optager, der kan tages med ud og gemme sensordata (og måske video). Optagelserne bruges derefter offline til at udvikle analysen.

**Andre projekter:**
- **ArcherFormReplay.** Video fra flere telefoner synkroniseret via WebRTC, udløst af lyden af slippet, med rullende buffer. Den kan senere levere videodelen.
- **ArrowPlot** er resultatdelen. Måske skal de integreres en dag, men det er ikke med i første omgang.
- **MantisX-appen.** Vi skal finde ud af mere om, hvordan den gør tingene.

## 2. Overvejelser om udstyr

### Enheden at se det på

Det vigtigste valgkriterium er **Web Bluetooth**. Det findes kun i Chrome og Edge på Android, Windows, macOS og ChromeOS. Safari på **iPhone og iPad har det ikke**. Det kan omgås med browseren Bluefy, men det er besværligt. Så det skal være **Android** (eller en PC).

| Enhed | Fordele | Ulemper |
|------|---------|----------|
| Din egen Android-mobil | Gratis, har du altid på dig, mobiler er typisk de lyseste skærme | Lille skærm til analyse |
| Android-tablet | Stor skærm, god til at gennemgå skud | Billige tablets har ofte svage LCD-skærme, der er svære at læse i sol |
| Bærbar PC | God til offline-udvikling og analyse | Dårligst udendørs, tung |

**Anbefaling.** Start med den mobil, du har. Bruger du optageren i felten, ligger den i lommen eller i et klip alligevel. Først når vi ved, hvad visningen skal kunne, giver det mening at købe en tablet. Er det en tablet, så gå efter en **brugt Samsung Galaxy Tab S** med AMOLED-skærm, som er lys og læselig udendørs. Undgå de billigste tablets. Jeg tjekker konkrete priser og Black Friday-tilbud, når jeg ved, hvad du har i forvejen.

### Sensorer

| Mulighed | Hvad er det | Fordele | Ulemper |
|---------|-------------|-------|----------|
| **WitMotion WT9011DCL / BWT901BLECL** | Færdig 9-akset BLE-sensor | Virker allerede (driveren er skrevet), op til 200 Hz, lille, med batteri | Ingen tidsstempler fra selve sensoren; BLE-jitter giver usikker timing mellem sensorer |
| **MantisX** (har du) | Færdig sensor til buen | ~400 Hz, gode slipdata | Ingen gyro om pilens akse i den kendte tilstand, ingen yaw, lukket protokol |
| **Gør det selv: Seeed XIAO nRF52840 Sense** | Lille printplade med 6-akset IMU og BLE, ca. 160 kr. (200–250 kr. med batteri) | Billigst, og **vi bestemmer firmwaren**: sensoren kan selv sætte tidsstempler og sende i pakker, så synkroniseringen mellem sensorer bliver præcis | Kræver batteri, kasse og firmware |
| **Gør det selv: M5StickC Plus2** | ESP32 med IMU, skærm og batteri i kasse | Færdig kasse, nemt at programmere | Større og tungere |
| Movesense o.l. | Professionelle sensorer | Høj kvalitet | Flere gange dyrere |

**Anbefaling.** Fortsæt med WitMotion i første omgang, da driveren findes. 2 stk. er nok til grebet plus én ekstra (fx hovedet). Køb **ikke** 4 endnu: jitter og antallet af BLE-forbindelser med 3–4 sensorer på samme mobil skal testes først. Hvis timingen mellem sensorer viser sig at være for upræcis, er en hjemmebygget XIAO-sensor med egne tidsstempler det billige alternativ. Priserne ovenfor er cirkapriser, som skal tjekkes.

### Med det udstyr du har (Samsung S20 FE, ældre Motorola, 1 MantisX, 1 WitMotion)

- **S20 FE** er hovedenheden: Android og Chrome (Web Bluetooth virker), Super AMOLED-skærm, der kan læses udendørs. Den er visning og feltoptager. **Ingen tablet nu.**
- **Motorola** er kamera nr. 1 på stativ. Når der skal bruges 2 kameraer, kan S20 FE eller en billig brugt Android-mobil være nr. 2.
- **MantisX og WitMotion** giver allerede 2 sensorer. Det er nok til grebet og et første forsøg med en sensor på trækarmen eller overkroppen.
- **Køb til Black Friday (lille budget):**
  - 1–2 ekstra **WitMotion WT9011DCL-BT50** til ca. €22–25 stk. (ca. 165–190 kr.) på eBay. Det er samme model som din nuværende (WT9011DCL), så den eksisterende driver passer.
  - 1 mobilstativ med holder.
  - Det er alt. Vent med mere, til optageren er testet.
- **Alternativ: XIAO nRF52840 Sense** (du har elektronik og en 3D-printer). Prisen pr. sensor er ca. 200–250 kr.:
  - selve printet: ca. £15 ekskl. moms, ca. 160 kr. inkl. moms
  - et lille LiPo-batteri (200–400 mAh) med beskyttelseskreds: ca. 30–60 kr.
  - en kontakt
  - en printet kasse

  Printet har opladekreds (BQ25101) og USB-C, så der skal ikke bygges ekstra elektronik til opladning. Strømforbruget ved streaming skal måles, men regn med mange timer på 300 mAh. Fordele:
  - **egne tidsstempler i sensoren**, så sensorerne kan synkroniseres
  - selvvalgt samplingsrate og pakker med flere målinger ad gangen
  - mikrofon, så sensoren selv kan høre slippet

  Ulemper: kun 6 akser (vi bruger ikke magnetometeret alligevel), vi skal selv lave orienteringsberegningen, og der skal skrives firmware.

  **Besluttet (2026-11-23):** vi kommer så langt som muligt med MantisX og WitMotion. Først når der skal bruges flere end to sensorer, vælges mellem flere WitMotion og XIAO. Skytten hælder til XIAO, men kun hvis den højere hastighed (forventet ~1000 Hz, op mod 3× MantisX) og de præcise tidsstempler giver noget, vi kan se i data. Afgøres fx af, om slippets forløb (10–20 ms) er for groft ved 339 Hz. Forventningen om nøjagtigheden: på niveau med de andre; monteringen betyder mere end chippen.

**Magnetometer.** Regn ikke med kompasset (yaw ud fra magnetfelt). Stabilisatorvægte, sigter og jord i felten forstyrrer det. Vi bruger gyro og accelerometer og regner højre/venstre *relativt* over det enkelte skud. Det gør MantisX også.

### Markører og kameraer

- **Kameraer.** Gamle mobiler er nok med 1080p ved 30–60 fps, plus et stativ og en mobilholder. ArcherFormReplay har allerede gjort synkroniseringen via lyd og netværk.
- **Synkronisering mellem video og sensorer.** Slippet er et skarpt fælles tidspunkt: det kan ses som et ryk i sensorerne og høres på lyden.
- **Kropsposition.** Den kan findes direkte i videoen uden markører med gratis pose-estimering (fx MediaPipe Pose).
- **Markører** (fx printede ArUco/AprilTag-firkanter på 3–5 cm på sensorernes kasser og på buen) er nyttige til at måle buens og sensorernes præcise stilling i billedet og til at kalibrere sensorerne mod video. Det koster kun print og tape. Det skal ikke bruges i første omgang.

## 3. Kalibrering: hvad skal gøres, og hvad kan regnes ud

| Hvad | Hvordan | Kræver noget af skytten? |
|------|---------|--------------------------|
| Gyroens nulpunkt | Måles automatisk, når sensoren ligger stille (og i stille perioder før skud) | Nej |
| Accelerometer | Fabrikskalibreringen er god nok | Nej |
| Magnetometer | Bruges ikke | Nej |
| **Sensorens montering**: hvilken vej peger den på buen? | **Op** = tyngdekraftens retning mens man holder. **Sideaksen** = den akse buen drejer om mellem skud mod mål i forskellig højde (felt/3D), eller under neddrejningen fra opsætningen. Efter få skud kan appen altså selv finde buens akser. | Nej, men én gang "bue lodret med vaterpas" gør den absolutte cant sikker |
| Cant og vinkler | Måles **absolut**: buens akser (sideaksen fra skud i forskellig højde, pilens akse fra rekylen i slippet) sammen med tyngdekraften giver den rigtige cant, også retningen. Det er nødvendigt, fordi nogle retninger altid er fejl (se afsnit 5). Derudover måles spredningen omkring skyttens egen normale stilling | Nej (vaterpas valgfrit) |
| Kropssensorer (hoved, overkrop) | En kort referencestilling ("stå rank, kig på målet"), og derefter vinkler *mellem* segmenter (hoved i forhold til overkrop), så monteringen betyder mindre | Ja, kort |
| Tidsforskel mellem sensorer | Slippet ses i alle sensorer og bruges som fælles nulpunkt | Nej |

Princippet er, at skytten skal gøre så lidt som muligt. Optageren gemmer **rådata**, så kalibreringen kan forbedres og køres igen på gamle optagelser.

## 4. Bue først, eller alt fra starten?

**Anbefaling.** Analyse og visning fokuserer først kun på grebet. Men **optageren og dataformatet laves til flere sensorer (og video) fra dag ét**. Så samler du allerede nu data fra hoved og krop på dine ture, og de kan bruges, når vi kommer så langt. Det koster næsten intet ekstra at optage, men det er dyrt at mangle data senere.

Grebets bevægelse kan fx vises sådan:
- Grebet set bagfra og fra siden, hvor bevægelsen **forstørres** (×10–×50), så små bevægelser bliver synlige.
- Kurver for cant, op/ned og venstre/højre fra ca. 1 s før til 0,5 s efter slippet.
- Retning og størrelse af buens bevægelse i slippet (follow-through).
- Flere skud lagt oven på hinanden, så man kan se, om de ligner hinanden. Skud kan sorteres efter målets højde.
- Afspilning i slowmotion.

## 5. Inspiration fra andre apps og hvad appen bør kunne

### Hvad andre gør

- **MantisX Archery** (bue). Sporer buens vej gennem hele skuddet, farver faserne og tager tid på dem, og giver en stabilitetsscore. Den har log over afstand og skive. Den er bygget til skive; højde og felt er ikke tænkt ind.
- **SCATT** (sportsskydning, nok den mest gennemarbejdede analyse). Sporet farves efter tid før skuddet, så det sidste sekund og de sidste 0,2 s står for sig. **Koordinationsdiagrammet** viser den gennemsnitlige afvigelse som funktion af tiden før skuddet. Kurven skal falde jævnt hen mod skuddet; stiger den til sidst, bevæger våbnet sig væk fra sigtet lige før skuddet. Desuden måles sigtets hastighed og hvor stor en del af tiden man er inden for en radius. SCATT har også et katalog over fejlmønstre og deres mulige årsager.
- **Blast Motion** (golf, sensor på køllen). Tempo: tid for baglæns sving, tid for nedsving og forholdet mellem dem. **HackMotion** (golf, sensor på håndleddet) måler ét afgørende led, viser en 3D-hånd og giver **lyd-feedback i realtid** under øvelser med målområder.
- **Videoapps** (ArcherSense, Archery Vision, Kinovea-lignende værktøjer). Finder skud automatisk og genafspiller dem, tegner skelet (pose) og vinkler, kan vise to skud side om side eller oven på hinanden og gå billede for billede. ArcherSense giver feedback i trin: stand, alignment, træk, anker, sigte, slip og follow-through.
- **Forskning.** IMU'er kan måle konsistens hos eliteskytter næsten lige så godt som motion capture. Jeg har **ikke** fundet nogen, der har målt hovedstilling med IMU ved skud op og ned ad bakke. Det ville være nyt.

### Funktioner, ArcheryMotion bør have

**Måling og visning**
- Faser med tider: opsætning, træk, anker, sigte/hold, slip, follow-through. Især **tid fra anker til slip** og hvor ens den er fra skud til skud (tempo som i golf).
- Koordinationsdiagram for grebet (efter SCATT): grebets afvigelse som funktion af tiden før slippet.
- Grebets bevægelse i slippet: retning og størrelse (falder buen til venstre, frem, op?).
- Sammenligning: et skud mod dine "bedste/typiske" skud, side om side eller overlejret, også med video senere.
- **Højde-analyse**, det særlige for felt og 3D: alle mål vist mod målets vinkel op/ned. Ændrer cant, hovedstilling og holdetid sig, når der skydes op eller ned?
- Udvikling i løbet af en session (træthed: ændrer formen sig de sidste pile?) og over tid.

**Forslag til forbedringer og fokuspunkter**
- **Arbejd hen mod en god form, ikke bare din egen.** Konsistens er vigtig, men en form, der gentages konsekvent forkert, er stadig forkert. Nogle bevægelser er også nemmere at gentage end andre. Feedbacken har derfor to lag:
  - *Teknikregler* gælder for alle skytter. De beskriver den form, man skal arbejde hen imod, og et brud på dem er en fejl, også selvom det sker hver gang. Eksempler:
    - Ingen cant mod pilens side (øverste ben til venstre for en højrehåndsskytte), for så stiger risikoen for, at pilen falder af hylden.
    - Intet collapse i slippet: trækket skal fortsætte bagud gennem slippet, ikke give efter fremad.
    - Ingen creep under hold.
    - Buen må ikke falde mod skytten i follow-through.
    - Trækalbuen ligger i linje bag pilen (afsnit 7).
    - Hvordan den gode form ser ud i sensordata, fase for fase, og en liste over regler med startgrænser står i [ideal-form.md](ideal-form.md).
  - *Konsistens* gælder inden for det, reglerne tillader. Appen lærer skyttens egen normale form ud fra mange skud og peger på det, der afviger: "holdetiden var 1,2 s længere på de sidste 6 pile", "cant varierer dobbelt så meget, når målet står lavt".
  - Brud på teknikreglerne kommer før konsistens. Skyttens nuværende form er udgangspunktet, og den gode form er målet, man flytter sig hen imod trin for trin.
  - Reglerne tager højde for skytteprofilen (højre- eller venstrehånd) og buetypen. Grænserne skal kunne justeres, og hvor der er et frit valg (fx hvor meget cant væk fra pilen), sætter skytten eller træneren selv målet.
- **Mønster → mulige årsager → øvelse.** Et lille katalog (som SCATT's fejlkatalog), der kobler et målt mønster til mulige årsager og en øvelse. Eksempel: buen falder til venstre i slippet → måske skævt tryk i grebet → øvelse med fokus på grebet. Formuleres som *mulige* årsager, ikke som en dom.
- **Ét fokuspunkt ad gangen.** Appen foreslår det vigtigste punkt for næste session, og en øvelse kan have et målbart mål (fx "cant inden for ±1° på 8 af 10 pile").
- **Lyd-feedback live** (som HackMotion), valgfrit: bip når holdetiden bliver for lang, eller når cant er uden for området. Nyttigt i felten, hvor man ikke kigger på skærmen.
- Senere kan årsagsforslag bruge kropssensorer og video ("hovedet bevægede sig før slippet").

## 6. Træningsmoduler

Ud over analysen skal appen kunne styre øvelser. Sensorerne finder selv ud af, hvornår du er i position, så tiden starter der, og de giver feedback undervejs. Det meste foregår med **lyd** (bip, tal, tale), så du ikke skal kigge på skærmen.

**Fælles byggesten:**
- *Fuldt træk* genkendes ved, at buen peger mod målet, bevæger sig lidt og ligger roligt, eventuelt bekræftet af en sensor på trækarmen.
- En live stabilitetsværdi.
- Advarsel, når *formen bryder sammen*:
  - stigende sving
  - buen eller trækarmen kryber fremad (creep)
  - cant, der glider
  - rysten (mere højfrekvent bevægelse, typisk træthed)
- En log over sessioner, så du kan se udviklingen over uger.

| Øvelse | Hvad den går ud på | Hvad sensorer og kameraer tilføjer |
|---------|--------------------|-----------------------------|
| **Holdeøvelse / Holding SPT** | Hold fuldt træk i fx 5 × 30 s med 30 s pause (Kisik Lee / USA Archery) | Tiden starter automatisk ved fuldt træk. Stabilitet pr. sekund, advarsel ved træthed, stopper når formen bryder. Viser, hvor længe du kan holde *med god form* |
| **Power SPT / gentagne træk** | Træk op til opsætning/loading uden at skyde, mange gange | Tæller gentagelser og måler, om trækket er lige hurtigt og følger samme bane hver gang |
| **Reversal / nedtræk** | Træk fuldt op og slip kontrolleret ned | Måler hvor jævn nedføringen er, og om buen holdes i linje |
| **Lukkede øjne** (Archery360-progression) | Sigt, luk øjnene 3–5 s, åbn og skyd. Videre, når du stadig er på målet | Måler objektivt **hvor meget og hvilken vej buen drev**, mens øjnene var lukkede. Signal ved start og slut |
| **Blank bale** | Skud på kort afstand uden at sigte, fokus på udførelsen | Sammenligner slip og follow-through med skud, hvor du sigter: er udførelsen den samme? |
| **Follow-through** | Hold buearmen oppe til pilen rammer, og tæl til 3 | Opdager om buearmen falder for tidligt eller til siden, og om hånden åbner sig før slippet |
| **Tempo / rytme** | Samme tid fra anker til slip hver gang | Valgfri metronom/lyd og et tidsvindue. Viser tidsspredning og om tempoet ændrer sig med trætheden |
| **Ekspansion / klikker** (World Archery) | Gennem klikkeren, ekspander, nulstil og gentag | En sensor på trækarmen viser, om trækket fortsætter bagud eller stopper/kryber frem. Virker også uden klikker (barebow) |
| **Elastikbånd hjemme** | Holde- og trækøvelser med elastikbånd | Sensorer på armene måler hold og bane uden bue |
| **Op/ned ad bakke** (felt/3D) | Skyd mod mål i forskellig højde | Med sensorer på overkrop og bue: **bøjer du i hoften og holder T-formen** (overkrop og bue drejer lige meget), eller løfter/sænker du armen? Specielt for felt |
| **Cant-øvelse** | Hold buen på en valgt cant (lodret eller en lille cant væk fra pilen, aldrig mod pilen) | Lyd-feedback, når cant er uden for ±1° af målet, og en tydelig advarsel ved cant mod pilens side |
| **Træthedstest** | Fx 30–60 pile | Viser formen pil for pil: hvornår begynder den at ændre sig? |

## 7. Alignment

**Hvad er god alignment?** Kilderne er trænermateriale og enkelte studier. Ordlyden varierer, men indholdet stemmer overens:
- Ved fuldt træk danner skuldre og arme en **trekant/T-form** med pilen.
- **Trækalbuen skal ligge i linje bag pilen**, både set fra siden og bagfra. Så går trækkraften (*draw force line*) gennem grebets trykpunkt, pilen og trækalbuen. Jo mindre vinklen er mellem knoglerne og kraftlinjen, jo mindre muskelarbejde og jo mere stabilt.
- **Bueskulderen skal være lav.** Den skal ikke løftes op mod hovedet. Det opnås med bevægelser, ikke ved at holde skulderen nede: løft armen, ikke skulderen, og hæv buen lidt over målet under trækket og sænk den ned på målet (BEST, se [ideal-form.md](ideal-form.md)).
- **Buearmen** skal have knoglerne i en lige linje fra hånd til skulder, med let rotation af albuen. For lang træklængde giver dårlig alignment og en høj bueskulder.
- Et studie (Frontiers 2025) fandt, at eliteskytter havde mindre skulderabduktion (ca. 99° mod 107° hos begyndere) og mindre albuebøjning (ca. 138° mod 144°), mens de sigtede. Det er kun gennemsnit og ikke grænseværdier.
- Når der skydes op eller ned, skal T-formen bevares ved at **bøje i hoften**, ikke ved at flytte armen.

**Sådan kan det måles:**
- **Video er bedst til absolut alignment.** Pose-estimering (fx MediaPipe) finder skuldre, albuer og håndled.
  - *Bagfra/oppefra* (i forlængelse af pilen, bag skytten): trækalbuens sideafstand til pilens linje.
  - *Fra siden* (foran og til siden for skytten, aldrig i skudlinjen): albuens højde i forhold til pilen og om bueskulderen løfter sig.
  - Appen kan tegne pilens linje og kraftlinjen oven i billedet og vise vinklerne.
  - Markører på buen og albuen gør det mere præcist.
- **Sensorer er bedst til stabilitet og konsistens i alignment.**
  - En sensor på trækarmen giver *albuens højde i forhold til pilen* direkte via tyngdekraften.
  - Vinklen *vandret* kræver en fælles retning mellem bue- og armsensor. Den kan nulstilles i en referencestilling eller én gang ud fra video, og holdes derefter med gyroen i det korte skud.
  - Sensorer viser fint, om alignment *ændrer sig* under hold og slip (creep, albue, der falder) og mellem skud mod mål i forskellig højde.
- **Kombinationen** er stærkest: Videoen kalibrerer sensorerne i kontrollerede forhold, og sensorerne bruges alene i felten.

## 8. Plan: de første trin

1. **Ryd op** (besluttet: samme repo). Prototypen markeres med git-tagget `v0-prototype`, og ny kode bygges op i dette repo. Protokolviden og MantisX-noterne beholdes.
2. **Udstyr.** Du fortæller, hvad du har (mobil, tablet, hvilke WitMotion-modeller og hvor mange). Jeg undersøger priser og Black Friday-tilbud og foreslår, hvad der evt. skal købes inden den 27. november.
3. **Feltoptager v1** (Android-mobil, PWA):
   - Skytteprofil og udstyrsopsætning vælges før en session, og hver optagelse gemmes med begge. Dataformatet bygges til det fra starten.
   - Forbind 1–4 sensorer (WitMotion, MantisX) og giv dem roller.
   - Optag uafbrudt med rådata og tidsstempler, find skud automatisk, og hold skærmen tændt.
   - Hurtig mærkning pr. skud: målet står **op / lige / ned**, afstand, greb/crawl, valgfri note.
   - Gem lokalt og eksportér optagelsen som én fil.
   - Første træningsmodul: **holdeøvelsen** (afsnit 6). Den er enkel og nyttig med det samme, og den giver gode data om hold og træthed.
4. **Analysebænk offline** (PC-browser): indlæs optagelser, se rå signaler, find skud og synkronisér sensorerne. Her udvikles resten.
5. **Kalibrering og montering** ud fra data som beskrevet i afsnit 3, testet på dine optagelser.
6. **Visning af grebets bevægelse** som beskrevet i afsnit 4, med faser, tempo og koordinationsdiagram fra afsnit 5.
7. **Første feedback:** først teknikreglerne (cant mod pilen, collapse i slippet, creep), derefter din egen normale form ud fra optagelserne, afvigelser, højde-analyse og et lille katalog over mønstre, årsager og øvelser.
8. **Flere træningsmoduler** (afsnit 6): lukkede øjne, follow-through, tempo og op/ned ad bakke.
9. **Alignment** (afsnit 7): sensor på trækarmen, derefter video med pose-estimering.
10. **Senere:** analyse af kropssensorer, video fra ArcherFormReplay, markører og evt. integration med ArrowPlot.
11. **Læringstilstand: hvad gør du, når pilen sidder rigtigt?** Pilens placering markeres pr. skud (eller hentes fra ArrowPlot), og appen sammenligner sensordata for skud i midten med skud, der sidder fx til højre eller lavt: "når pilen går til højre, drejer buen mere i slippet". Datamodellen er klar (`ShotRecord.impact` og `arrow`, se [optagelsesformat.md](optagelsesformat.md)), men der er ingen indtastning endnu. Når det skal laves: integrér eller kopiér koden fra ArrowPlot, eller lav én fælles app, der kan begge dele.
12. **Sensor på trækhånden/håndleddet: hvad gør hånden i slippet?** Strengen slipper, når fingrene ikke længere holder krogen (BEST: fingrene slapper helt af, og strengen skubber dem til side). Bevægelsen bagud udløser ikke slippet, men bestemmer, hvad hånden gør bagefter. Sensoren skal vise:
    - om hånden bevæger sig **bagud langs halsen** i slippet (bevægelsen bagud fortsatte), eller om den **bliver stående** ved ankeret eller går frem (bevægelsen var gået i stå, collapse)
    - om hånden **drejer eller rykker ud til siden** i slippet, det kan tyde på, at fingrene åbner aktivt (plukker)
    - tiden mellem slippet i buesensoren og håndens bevægelse.

    Kræver en tredje sensor, så beslutningen mellem flere WitMotion og XIAO (afsnit 2) skal træffes først. Slippet varer 10–20 ms, så en højere samplingshastighed og præcise tidsstempler kan få betydning her. Sensoren skal sidde på håndryggen eller håndleddet, så den ikke rører ansigtet ved ankeret.

Ved siden af: **mere fra MantisX-appen**. Her skal du nævne, hvad du gerne vil vide (fx andre samplingstilstande med gyro y, hvordan den finder slippet, eller flere mål).

## Åbne spørgsmål

- Hvad vil du især vide om MantisX-appen?

## Kilder (feedbacktiming)

- [Swinnen m.fl. 1990: Instantaneous KR degrades learning (omtalt)](https://pmc.ncbi.nlm.nih.gov/articles/PMC1780106), [Carter & Ste-Marie 2017: aktivitet i ventetiden før feedback](https://raw.github.com/cartermaclab/carterlab-papers/main/2017_carter-ste-marie_an-interpolated-activity-during-the-knowledge-of-results-delay-interval-eliminates-the-learning-advantages-of-self-controlled.pdf)
- [Interferens i kortidshukommelsen for bevægelser](https://scholarspace.manoa.hawaii.edu/items/c64014fa-c524-4134-a64d-eadd6b215083), [Proprioceptiv arbejdshukommelse (preprint)](https://arxiv.org/pdf/2510.21996)
- [Reduceret feedbackhyppighed, postural kontrol 2024](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10933749/), [Sonificering 2016 (modsat resultat)](https://www.frontiersin.org/articles/10.3389/fnins.2016.00251/full)

## Kilder (afsnit 6–7)

- Træning: [USA Archery: SPT](https://www.usarchery.org/news/developing-strength-and-endurance-with-spts), [KSL SPT-håndbog](https://kslinternationalarchery.com/Training/SPTs/SPTtrainingHandbook.pdf), [World Archery: 10 øvelser](https://worldarchery.org/news/178467/), [Archery360: 4 øvelser (lukkede øjne)](https://archery360.com/?p=98454), [Archery360: stærk buearm](https://archery360.com/2020/11/10/how-to-develop-strong-bow-arm/), [Outdoor Life: blank bale](https://www.outdoorlife.com/blogs/game-changers/archery-practice-go-point-blank-bales-better-form)
- Alignment: [Archery360: What is Alignment?](https://archery360.com/2020/08/11/what-is-alignment), [Human Kinetics: Establish Perfect Form](https://us.humankinetics.com/blogs/excerpt/establish-perfect-archery-form), [Archery360: høj bueskulder](https://archery360.com/2019/05/21/solving-high-front-shoulder-issues/), [Frontiers 2025: elite vs. begyndere](https://www.frontiersin.org/articles/10.3389/fspor.2025.1650300/full), [Draw force line-studie](https://www.scribd.com/document/514327106/4-Ahmad-et-al)
- Priser: [eBay WT9011DCL-BT50](https://www.ebay.de/itm/364856448017)

## Kilder (afsnit 5)

- [MantisX for Archery](https://mantisx.com/pages/mantisx-for-archery), [American Hunter: Mantis X8 Archery](https://www.americanhunter.org/content/first-look-mantis-x8-archery-trainer)
- [SCATT: Shooter's Coordination Analysis](https://www.scatt.com/blogs/articles/shooters-coordination-analysis), [SCATT: fejl og årsager](https://www.scatt.com/blogs/articles/errors-in-shooting-and-possible-reasons-for-their-occurrence), [PLOS One om stabilitet hos luftpistolskytter](https://pmc.ncbi.nlm.nih.gov/articles/PMC8769313)
- [Golf Digest: Blast Motion tempo](https://www.golfdigest.com/story/blast-motions-latest-swing-analyzer-will-improve-timing-and-tempo), [HackMotion-anmeldelse](https://www.golflink.com/equipment/hackmotion-review-3432639)
- [ArcherSense](https://sportstechie.net/?p=12510), [Archery Vision](https://mwm.ai/apps/archery-vision/1641606158)
- [IMU til konsistens hos bueskytter](https://www.bohrium.com/paper-details/a032-archery-consistency-assessment-by-using-inertial-measurement-unit-imu/1085325390693531696-125740), [Ergonomi med 17 sensorer](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10974659/), [Postural stabilitet udendørs](https://mdpi.com/2075-4663/13/9/310)
