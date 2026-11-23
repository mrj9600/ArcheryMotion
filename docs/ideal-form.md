# Den gode form set med sensorer

Dette dokument beskriver, hvordan den gode form ser ud i data fra sensoren på buen og sensoren på trækalbuen. Det er udgangspunktet for appens **teknikregler** (se [vision-og-plan.md](vision-og-plan.md), afsnit 5).

## Kildernes vægt

Der findes mange gode råd om teknik, men mange af dem kommer fra folk, der ikke ved så meget. Derfor gælder:
- En påstand skal have **konsensus mellem flere uafhængige kilder** for at bruges i appen.
- Den eneste undtagelse er et **videnskabeligt studie af en bestemt bevægelse**. Bygger noget i appen kun på ét studie, skal det godkendes først.
- Forum-indlæg, forhandleres blogs og jagtblade bruges ikke som belæg.

Hver påstand er mærket med sit grundlag:

| Mærke | Betyder |
|-------|---------|
| **[Fysik]** | Følger af mekanik og kan regnes ud. Kræver ingen kilde |
| **[Flere studier]** | Flere uafhængige videnskabelige studier peger samme vej |
| **[Ét studie]** | Kun ét studie (eller én forskergruppe). **Skal godkendes, før det bruges i appen** |
| **[Trænere]** | Bred enighed i trænermateriale. Ikke tjekket mod World Archery's eller USA Archery's trænermateriale endnu |
| **[Skytten]** | Din vurdering som erfaren skytte |
| **[Gæt]** | Min egen startværdi. Skal sættes på rigtige optagelser |

Forskningen giver mest retninger ("mindre er bedre", "bagud, ikke frem") og meget få grænseværdier. Næsten alle tal i reglerne er derfor **[Gæt]**.

## Akser

For at reglerne giver mening, skal sensorernes data regnes om til buens akser (afsnit 3 i planen):

| Akse | Retning | Rotation om aksen hedder |
|------|---------|--------------------------|
| **Pilens akse** | Fremad mod målet | *Cant* (buen hælder til siden) |
| **Sideaksen** | Vandret, på tværs af pilen | *Op/ned* (pitch), også buens tip frem i slippet |
| **Håndsektionens akse** | Op langs buen | *Venstre/højre* (yaw), også *torque* fra grebet |

Pilens side er venstre for en højrehåndsskytte og højre for en venstrehåndsskytte. Reglerne bruger "mod pilens side" og "væk fra pilens side", så de virker for begge.

## Faserne og den gode form

### 1. Opsætning og træk

- **Cant sættes før trækket og ændres ikke under trækket.** **[Trænere]**
- Buearmen peger mod målet hele vejen, og trækalbuen bevæger sig bagud og rundt, til den ligger i linje bag pilen. **[Trænere]**

### 2. Anker, sigte og hold

**Buen:**
- **Mindre bevægelse og rysten under sigtet giver bedre præcision.** **[Flere studier]** En systematisk gennemgang af 16 studier finder sammenhængen, men kalder grundlaget tyndt ([gennemgang](https://www.researchgate.net/publication/393299329_Relationship_Between_Shooting_Performance_and_Biomechanical_Parameters_Associated_with_Body_Stability_in_Archery_A_Systematic_Review)). Det samme gælder compound-eliteskytter ([Kim m.fl. 2025](https://pubmed.ncbi.nlm.nih.gov/39998444)). Mindst ét studie fandt ingen sammenhæng i sigtefasen.
- **Bevægelsen skal blive mindre hen mod slippet, ikke større.** **[Gæt]** Idéen kommer fra SCATT's koordinationsdiagram til riffelskydning. Den er ikke undersøgt for bueskydning.
- Begyndere har mest variation i lodret retning. **[Ét studie]** ([PMC11235681](https://pmc.ncbi.nlm.nih.gov/articles/PMC11235681))
- Grænser for udsving og rysten. **[Gæt]**
- **Aldrig cant mod pilens side.** **[Skytten]** **[Fysik]** Hylden hælder så væk fra buen, og pilen kan falde af. Lodret eller en lille, fast cant væk fra pilens side er et frit valg.
- **Stabil cant og ingen drift under holdet.** **[Trænere]** Grænserne på ±1° er **[Gæt]**.

**Trækalbuen:**
- **Bevæger sig langsomt bagud og rundt (ekspansion), aldrig frem (creep).** **[Trænere]**
- Hvor rolig trækarmen er hos eliteskytter. Jeg fandt ingen pålidelig kilde (tallet 0,5° mod 3,5° kom fra en sekundær gennemgang uden primær kilde), så det bruges ikke.
- Albuens højde i forhold til pilen er den samme fra skud til skud. **[Trænere]** (afsnit 7 i planen)

### 3. Slippet

**Buen:**
- **Buen bevæger sig fremad mod målet, når fingrene slipper.** **[Fysik]** Buearmens tryk modsvares ikke længere af strengen. Med et afslappet greb er bevægelsen mest langs pilens akse.
- Eliteskytter spænder strækkemusklerne i hånden, så de ikke griber om buen. **[Ét studie]** ([accelerometer-studie](https://www.researchgate.net/publication/349147216_Archery_Skill_Assessment_Using_an_Acceleration_Sensor))
- **Buen tipper frem** med buesling. **[Trænere]** **[Fysik]**
- **Rotation om håndsektionens akse eller et ryk i cant betyder torque fra grebet.** **[Fysik]** Hvor meget der er normalt, afhænger af udstyret. **[Gæt]**
- **Buen må ikke bevæge sig lige før slippet** (foregribelse, fx at kigge efter pilen). **[Trænere]** Vinduet på 0,2 s er **[Gæt]**.

**Trækalbuen:**
- **Fortsætter bagud i slippet. Collapse (bevægelse frem mod målet) er altid en fejl.** **[Skytten]** **[Trænere]** I data ses det som acceleration eller rotation af albuens sensor *fremad*, eller at bevægelsen bagud stopper og vender lige før slippet.

### 4. Follow-through

- **Buearmen bliver oppe og peger mod målet, til pilen rammer.** **[Trænere]** Hvor længe ("1–2 s") og hvor meget den må falde, er **[Gæt]**.
- **Trækhånden ender bag hovedet** og bliver der. **[Trænere]**
- **Jævn bevægelse efter slippet er vigtigere end at holde helt stille.** **[Ét studie]**, og kun for compound ([Kim m.fl. 2025](https://pubmed.ncbi.nlm.nih.gov/39998444)). Ét andet studie fandt, at stabiliteten efter slippet betyder mere for recurve end for compound ([MDPI 2025](https://www.mdpi.com/2075-4663/13/9/310)). Bruges ikke, før det er bekræftet.

### 5. Tid og rytme

- **Ens tid fra anker til slip.** Studierne er uenige.
  - Variationen i tid fra klikker til slip hænger sammen med pointene hos de bedste skytter, men ikke i en bredere gruppe ([Callaway m.fl.](https://eprints.bournemouth.ac.uk/24308/7/Callaway_Archery_ArchiveCopy.pdf)).
  - Om kortere sigtetid er bedre, er også omstridt ([Frontiers 2025](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1650300/full)).
  - Appen viser tempoet, men dømmer det ikke, før studierne er gennemgået bedre.
- **Slippet kommer hurtigt efter klikkeren** (ca. 100 ms hos eliteskytter mod 200 ms hos begyndere). **[Ét studie]** ([Clarys m.fl.](https://www.researchgate.net/publication/324161306_Muscular_coordination_of_movements_associated_with_arrow_release_in_archery)). Er alligevel ikke relevant for barebow uden klikker.

### 6. Op og ned ad bakke (felt og 3D)

- **T-formen bevares ved at bøje i hoften.** **[Trænere]** Uden sensor på overkroppen ses det indirekte: cant og trækalbuens højde i forhold til buen skal være de samme, uanset målets højde.

## Hvornår er pilen fri af buen?

Skytten påvirker kun pilen, så længe pilen rører strengen eller buen. **[Fysik]** Bevægelser senere kan ikke ændre pilens flugt. De viser stadig, hvilke kræfter der virkede i slippet.

**Målinger (recurve, højhastighedsvideo):**
- Pilen forlader strengen ca. **15–20 ms** efter, at slippet begynder. **[Flere studier]** Park 2012 henviser til to tidligere studier med samme resultat ([Park 2012](https://www.researchgate.net/publication/258178764_High-speed_video_analysis_of_arrow_behaviour_during_the_power_stroke_of_a_recurve_archery_bow)), og et nyere studie angiver under 16 ms ([arXiv 2402.12389](https://arxiv.org/pdf/2402.12389)). Mit overslag nedenfor giver det samme. **[Fysik]**
- Pilens kontakt med plungeren slutter inden for ca. 8 ms. **[Ét studie]** (Park 2012)

**Overslag for en barebow-skytte. [Fysik]** Med fx 71 cm træklængde og 22 cm stavhøjde bliver trækslaget ca. 49 cm:
- Pilen når fx 55 m/s og har gennemsnitligt omkring halv fart under trækslaget. Det giver ca. 0,49 / 27,5 ≈ **18 ms** på strengen.
- Nocken skal derefter ca. en stavhøjde (22 cm) frem for at komme forbi hylden. Det tager ca. **4 ms**.
- **Pilen er helt fri af buen ca. 20–25 ms efter, at slippet begynder.** Mest tid ved lav trækvægt, kort træklængde og tunge pile.

**Hvad det betyder for appen:**
- **Det afgørende vindue er de sidste ca. 50 ms før og de første ca. 25 ms efter slippet.** **[Fysik]** Hvor langt vinduet går tilbage, er **[Gæt]**.
- **Det store ryk i buens accelerometer kommer, når benene stopper ved stavhøjden**, omtrent når pilen forlader strengen. **[Fysik]** Appens slip-tidspunkt ligger derfor ca. 15–20 ms efter, at fingrene åbner sig. Den første lille fremadgående acceleration før rykket er det egentlige slip. Det skal bekræftes i rigtige optagelser.
- **Sensorernes hastighed:**
  - MantisX måler ved ca. 340 Hz (3 ms mellem målinger), så vinduet dækkes af 7–8 målinger.
  - WitMotion kører typisk ved 100–200 Hz (5–10 ms), så vinduet dækkes kun af 2–5 målinger.
  - Til at se, hvad der sker *i* vinduet, er MantisX på buen bedst. Tidsstemplerne fra BLE har en usikkerhed på flere millisekunder.
- **Follow-through er et forstørrelsesglas på slippet.** **[Fysik]** En drejning eller et collapse, der ses 50–200 ms efter slippet, er startet af kræfter, der virkede i vinduet.
- **Udstyret bestemmer tiden.** Stavhøjde og pilens vægt eller hastighed bør tilføjes til udstyrsopsætningen, så vinduet kan regnes ud pr. bue.

## Teknikregler, som appen kan tjekke

Reglerne gælder for alle skytter. Et brud er en fejl, også hvis det sker hver gang. Kolonnen "Grundlag" gælder reglen. Grænserne er alle **[Gæt]**.

| Regel | Grundlag | Sensor | Fejl når (startværdi) | Kræver |
|-------|----------|--------|-----------------------|--------|
| Ingen cant mod pilens side | Skytten, fysik | Bue | Cant > 1° mod pilens side under holdet | Buens akser, håndethed |
| Stabil cant under hold | Trænere | Bue | Ændring > 1° fra anker til slip | Buens akser |
| Ingen bevægelse før slippet | Trænere | Bue | Op/ned eller venstre/højre ændrer sig > 0,5° i de sidste 0,2 s | Buens akser |
| Buen frem i slippet | Fysik, trænere | Bue | Under ca. 70 % af den første acceleration er langs pilens akse | Buens akser |
| Ingen torque i slippet | Fysik | Bue | Rotation om håndsektionens akse eller cant-ryk over grænse (sættes fra data) | Buens akser |
| Buearmen bliver oppe | Trænere | Bue | Pitch falder > ca. 5° i de første 0,5 s efter buens tip frem | Buens akser |
| Ingen creep | Trænere | Albue | Albuen roterer frem under holdet | Albuens retning bagud |
| Intet collapse | Skytten, trænere | Albue | Albuen bevæger sig frem i slippet | Albuens retning bagud |
| Fortsat bagud i slippet | Trænere | Albue | Ingen tydelig bevægelse bagud inden for 0,1 s efter slippet | Albuens retning bagud |

Albuens retning "bagud" kan appen selv finde: under trækket bevæger albuen sig bagud.

**Ikke regler endnu** (vises som tal, men dømmes ikke):
- "Roligere hen mod slippet". **[Gæt]**, ikke undersøgt for bueskydning.
- Tempo fra anker til slip. Studierne er uenige.
- Jævn bevægelse efter slippet. **[Ét studie]**, kun compound.

## Det, vi ikke ved endnu

- **Trænerkonsensus er ikke tjekket mod de bedste kilder.** Det, der er mærket **[Trænere]**, bygger her på artikler og blogs, der er enige, men ikke autoritative. Næste skridt er at tjekke dem mod World Archery's trænermanualer (Coach's Manual niveau 1–3) og evt. Kisik Lee / USA Archery's metode.
- **Ingen absolutte grænser fra forskningen** for buens udsving i grader eller °/s. Studierne sammenligner grupper. Grænserne må findes på dine egne optagelser og senere på andre skytter.
- **Buens bevægelse i slippet afhænger af udstyret**: stabilisatorer, vægte, buesling og trækvægt.
- **Barebow er sparsomt beskrevet.** Det meste forskning er på recurve med sigte og compound. String-walking kan påvirke slippet.

## Næste skridt

1. Find buens akser i optagelserne (afsnit 3 i planen), så cant, op/ned og venstre/højre kan regnes ud.
2. Tjek reglerne mærket **[Trænere]** mod World Archery's trænermateriale.
3. Vis reglerne i analysebænken på rigtige optagelser, og sæt grænserne ud fra dem.
4. Hvis du har adgang til en skytte eller træner med god form, vil optagelser med begge sensorer være meget værdifulde som reference.
