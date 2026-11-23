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
| **[BEST]** | USA Archery's BEST-metode ([håndbog](https://www.mfaa-archery.org/Tech-Support/Archery_Form_Handbook.pdf)) og Kisik Lee's KSL Shot Cycle ([KSL](https://www.kslinternationalarchery.com/Technique/KSLShotCycle/KSLShotCycle-USA.html)). Autoritativt trænermateriale, som skytten har godkendt |
| **[Trænere]** | Bred enighed i artikler, men ikke fundet i BEST/KSL |
| **[Skytten]** | Din vurdering som erfaren skytte |
| **[Gæt]** | Min egen startværdi. Skal sættes på rigtige optagelser |

Forskningen giver mest retninger ("mindre er bedre", "bagud, ikke frem") og meget få grænseværdier. Næsten alle tal i reglerne er derfor **[Gæt]**.

## Bevægelser, ikke muskelspænding

Appen beskriver den gode form som **bevægelser og stillinger**, aldrig som muskelspænding. **[Skytten]** At fokusere på at spænde musklerne kan få skytten til at spænde for meget. Når BEST/KSL taler om fx rygspænding, oversætter appen det til den bevægelse eller stilling, det giver: trækalbuen fortsætter bagud, trækskulderbladet går mod rygsøjlen, trækhånden bliver bag nakken. Det passer også med, hvad sensorerne kan måle: bevægelser, ikke spænding.

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

- **Cant sættes før trækket og ændres ikke under trækket.** **[Trænere]** Cant er ikke nævnt i BEST/KSL.
- Buen og buearmen løftes, ikke skuldrene. Buearmen må være lidt over målet under trækket. **[BEST]**
- Trækket er at "åbne buen" ved at dreje kroppen om bueskulderen, med kraften fordelt 50/50 mellem bue- og trækside. **[BEST]**
- Hovedet må ikke bevæge sig under træk og anker. **[BEST]** Kræver en hovedsensor.
- Overgangen fra anker til hold (*transfer/loading*) tager ca. 0,5 s. **[BEST]** (KSL)

### 2. Anker, sigte og hold

**Buen:**
- **Mindre bevægelse og rysten under sigtet giver bedre præcision.** **[Flere studier]** En systematisk gennemgang af 16 studier finder sammenhængen, men kalder grundlaget tyndt ([gennemgang](https://www.researchgate.net/publication/393299329_Relationship_Between_Shooting_Performance_and_Biomechanical_Parameters_Associated_with_Body_Stability_in_Archery_A_Systematic_Review)). Det samme gælder compound-eliteskytter ([Kim m.fl. 2025](https://pubmed.ncbi.nlm.nih.gov/39998444)). Mindst ét studie fandt ingen sammenhæng i sigtefasen.
- **Bevægelsen skal blive mindre hen mod slippet, ikke større.** **[Gæt]** Idéen kommer fra SCATT's koordinationsdiagram til riffelskydning. Den er ikke undersøgt for bueskydning. BEST siger tværtimod, at sigtet skal have lov at bevæge sig lidt frem for at spænde op for at holde det stille. Derfor er det ikke en regel.
- Begyndere har mest variation i lodret retning. **[Ét studie]** ([PMC11235681](https://pmc.ncbi.nlm.nih.gov/articles/PMC11235681))
- Grænser for udsving og rysten. **[Gæt]**
- **Aldrig cant mod pilens side.** **[Skytten]** **[Fysik]** Hylden hælder så væk fra buen, og pilen kan falde af. Lodret eller en lille, fast cant væk fra pilens side er et frit valg.
- **Cant ligger fast fra anker til slip.** **[Skytten]** **[Trænere]** 1° er målet for den perfekte form. Det er svært at holde, så appen viser, hvor langt man er fra målet, og skytten kan sætte et personligt delmål (fx 3°), der strammes efterhånden. Mindre bevægelse er altid bedre.

**Trækalbuen:**
- **Ekspansionen er lille og indvendig.** **[BEST]**
  - Ved anker stopper bevægelsen ikke, men den bliver langsom og indvendig.
  - Ekspansionen er 2–3 mm. Bueskulderbladet bevæger sig mod målet, og trækskulderbladet mod rygsøjlen.
  - KSL siger, at strengen ikke synligt skal bevæge sig mod et mærke på brystbeskytteren.
  - **For sensorerne betyder det:** under holdet skal trækalbuen være næsten i ro, med en meget lille bevægelse bagud. Appen kan ikke kræve en tydelig bevægelse bagud. Den kan kun fange **bevægelse frem (creep)**, som strider mod både ekspansion og 50/50-balancen. **[BEST]**
- **Albuen ligger i linje med pilen** set fra siden og bagfra. KSL: lidt bag linjen, aldrig foran. **[BEST]**
- **Albuens højde er på linje med pilen eller lidt over.** **[BEST]** Er den for høj, kan de rigtige rygmuskler ikke bruges. Sensoren på albuen kan måle højden via tyngdekraften.
- Hvor rolig trækarmen er hos eliteskytter, har jeg ingen pålidelig kilde til. Tallet 0,5° mod 3,5° kom fra en sekundær gennemgang uden primær kilde, så det bruges ikke.

### 3. Slippet

**Buen:**
- **Buen bevæger sig fremad mod målet, når fingrene slipper.** **[Fysik]** Buearmens tryk modsvares ikke længere af strengen. Med et afslappet greb er bevægelsen mest langs pilens akse.
- Eliteskytter spænder strækkemusklerne i hånden, så de ikke griber om buen. **[Ét studie]** ([accelerometer-studie](https://www.researchgate.net/publication/349147216_Archery_Skill_Assessment_Using_an_Acceleration_Sensor))
- **Buen bevæger sig frem ud af buehånden, til slyngen stopper den, og mod målet. Buehånden er helt afslappet og falder naturligt ned.** **[BEST]** **[Fysik]** Buen tipper altså frem.
- **Alt bevæger sig først i samme plan, lige mod eller lige væk fra målet.** **[BEST]** Det er det stærkeste krav til sensorerne: buen accelererer først langs pilens akse mod målet, og trækalbuen bevæger sig langs samme linje væk fra målet.
  - KSL: buearmen bevæger sig lidt til venstre (højrehåndsskytte) på grund af ekspansionen. **[BEST]** En lille bevægelse væk fra pilens side er altså normal. Bevægelse mod pilens side er ikke.
- **Buearmen bevæger sig ikke, før pilen er fri af buen.** **[BEST]** Den er stærk og ubevægelig gennem slip og follow-through. Det er reglen "ingen bevægelse før slippet". Vinduet på 0,2 s er **[Gæt]**.
- **Slippet må ikke komme fra at skubbe buen med buehånden.** **[BEST]** (KSL) Et skub ses som en bevægelse af buen mod målet *før* slippet.
- **Rotation om håndsektionens akse eller et ryk i cant betyder torque fra grebet.** **[Fysik]** BEST: buehåndens tryk skal være ens og naturligt, og grebet må aldrig gribes om. Hvor meget rotation der er normalt, afhænger af udstyret. **[Gæt]**

**Trækalbuen:**
- **Trækhånden følger tæt langs halsen og ender bag nakken. Der kommer et naturligt rekyl bagud.** **[BEST]** Trækskulderbladet bevæger sig mod rygsøjlen.
- **Collapse (bevægelse frem mod målet i slippet) er altid en fejl.** **[Skytten]** Ordet collapse bruges ikke i BEST/KSL, men en bevægelse frem strider mod det rekyl bagud, de beskriver. I data ses det som acceleration eller rotation af albuens sensor *fremad*, eller at bevægelsen bagud udebliver.
- **Follow-through skal være naturlig, ikke overdrevet.** **[BEST]** En tvunget, overdrevet bevægelse bagud er et tegn på et dårligt slip (KSL). Appen må altså ikke belønne et stort ryk bagud.

### 4. Follow-through

- **Buearmen holdes oppe, stabil og stærk.** **[BEST]** Hvor meget den må falde, er **[Gæt]**.
- **Stillingen holdes 1–2 s efter slippet**: trækhånden bliver bag nakken og buearmen oppe. **[BEST]** (KSL kalder det at holde rygspændingen; se "Bevægelser, ikke muskelspænding".)
- **Trækhånden må ikke falde ned mod skulderen**, for så falder albuen for langt. **[BEST]** (KSL)
- **Follow-through er en indikator for, hvor rigtigt skuddet blev udført.** **[BEST]** Det passer med, at bevægelserne efter slippet viser de kræfter, der virkede i slippet.
- **Jævn bevægelse efter slippet er vigtigere end at holde helt stille.** **[Ét studie]**, og kun for compound ([Kim m.fl. 2025](https://pubmed.ncbi.nlm.nih.gov/39998444)). Ét andet studie fandt, at stabiliteten efter slippet betyder mere for recurve end for compound ([MDPI 2025](https://www.mdpi.com/2075-4663/13/9/310)). Bruges ikke, før det er bekræftet.

### 5. Tid og rytme

- **Sigte og ekspansion varer højst 1–3 s, og sigtet er kort og ubevidst.** **[BEST]** (BEST og KSL: tiden fra hold til slip er bedst på 1–3 s.)
- **Ens rutine fra skud til skud.** **[BEST]**
- Studierne er uenige om, hvor meget variationen i tempo betyder. Variationen i tid fra klikker til slip hænger sammen med pointene hos de bedste skytter, men ikke i en bredere gruppe ([Callaway m.fl.](https://eprints.bournemouth.ac.uk/24308/7/Callaway_Archery_ArchiveCopy.pdf)). Om kortere sigtetid er bedre, er omstridt ([Frontiers 2025](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1650300/full)). Appen bruger derfor BEST's 1–3 s som regel og viser variationen uden at dømme den.
- **Slippet kommer hurtigt efter klikkeren** (ca. 100 ms hos eliteskytter mod 200 ms hos begyndere). **[Ét studie]** ([Clarys m.fl.](https://www.researchgate.net/publication/324161306_Muscular_coordination_of_movements_associated_with_arrow_release_in_archery)). Er alligevel ikke relevant for barebow uden klikker.

### 6. Op og ned ad bakke (felt og 3D)

- **T-formen bevares ved at bøje i hoften.** **[Skytten]** **[Trænere]** T-formen i skulderled og overkrop bevares. Ikke nævnt i BEST/KSL, som er skrevet til skiveskydning på flad bane. Uden sensor på overkroppen ses det indirekte: cant og trækalbuens højde i forhold til buen skal være de samme, uanset målets højde.

## Hvornår er pilen fri af buen?

Skytten påvirker kun pilen, så længe pilen rører strengen eller buen. **[Fysik]** Bevægelser senere kan ikke ændre pilens flugt. De viser stadig, hvilke kræfter der virkede i slippet.

**Målinger (recurve, højhastighedsvideo):**
- Pilen forlader strengen ca. **15–20 ms** efter, at slippet begynder. **[Flere studier]** Park 2012 henviser til to tidligere studier med samme resultat ([Park 2012](https://www.researchgate.net/publication/258178764_High-speed_video_analysis_of_arrow_behaviour_during_the_power_stroke_of_a_recurve_archery_bow)), og et nyere studie angiver under 16 ms ([arXiv 2402.12389](https://arxiv.org/pdf/2402.12389)). Mit overslag nedenfor giver det samme. **[Fysik]**
- Pilens kontakt med plungeren slutter inden for ca. 8 ms. **[Ét studie]** (Park 2012)

**Overslag for en barebow-skytte. [Fysik]** Med fx 71 cm træklængde og 22 cm strenghøjde (brace height: afstand fra strengen til grebets dybeste punkt) bliver trækslaget ca. 49 cm:
- Pilen når fx 55 m/s og har gennemsnitligt omkring halv fart under trækslaget. Det giver ca. 0,49 / 27,5 ≈ **18 ms** på strengen.
- Nocken skal derefter ca. en strenghøjde (22 cm) frem for at komme forbi hylden. Det tager ca. **4 ms**.
- **Pilen er helt fri af buen ca. 20–25 ms efter, at slippet begynder.** Mest tid ved lav trækvægt, kort træklængde og tunge pile.

**Hvad det betyder for appen:**
- **Det afgørende vindue er de sidste ca. 50 ms før og de første ca. 25 ms efter slippet.** **[Fysik]** Hvor langt vinduet går tilbage, er **[Gæt]**.
- **Det store ryk i buens accelerometer kommer, når benene stopper ved strenghøjden**, omtrent når pilen forlader strengen. **[Fysik]** Appens slip-tidspunkt ligger derfor ca. 15–20 ms efter, at fingrene åbner sig. Den første lille fremadgående acceleration før rykket er det egentlige slip. Det skal bekræftes i rigtige optagelser.
- **Sensorernes hastighed:**
  - MantisX måler ved ca. 340 Hz (3 ms mellem målinger), så vinduet dækkes af 7–8 målinger.
  - WitMotion kører typisk ved 100–200 Hz (5–10 ms), så vinduet dækkes kun af 2–5 målinger.
  - Til at se, hvad der sker *i* vinduet, er MantisX på buen bedst. Tidsstemplerne fra BLE har en usikkerhed på flere millisekunder.
- **Follow-through er et forstørrelsesglas på slippet.** **[Fysik]** En drejning eller et collapse, der ses 50–200 ms efter slippet, er startet af kræfter, der virkede i vinduet.
- **Udstyret bestemmer tiden.** Strenghøjde og pilens vægt eller hastighed bør tilføjes til udstyrsopsætningen, så vinduet kan regnes ud pr. bue.

## Teknikregler, som appen kan tjekke

Reglerne gælder for alle skytter. Et brud er en fejl, også hvis det sker hver gang. Kolonnen "Grundlag" gælder reglen. Grænserne er alle **[Gæt]**.

| Regel | Grundlag | Sensor | Fejl når (startværdi) | Kræver |
|-------|----------|--------|-----------------------|--------|
| Ingen cant mod pilens side | Skytten, fysik | Bue | Cant > 1° mod pilens side under holdet | Buens akser, håndethed |
| Stabil cant under hold | Skytten, trænere | Bue | Ændring > 1° fra anker til slip | Buens akser |
| Ingen bevægelse før slippet (intet skub, ingen foregribelse) | BEST | Bue | Op/ned, venstre/højre eller fremad ændrer sig over grænse i de sidste 0,2 s | Buens akser |
| Buen frem i slippet, i pilens plan | BEST, fysik | Bue | Under ca. 70 % af den første acceleration er langs pilens akse | Buens akser |
| Ingen torque i slippet | Fysik, BEST | Bue | Rotation om håndsektionens akse eller cant-ryk over grænse (sættes fra data) | Buens akser |
| Buearmen bliver oppe | BEST | Bue | Pitch falder > ca. 5° i de første 0,5 s efter buens tip frem | Buens akser |
| Albuen på linje med pilen eller lidt over | BEST | Albue | Albuens højde afviger over grænse fra pilens linje | Albue- og buesensor, fælles reference |
| Ingen creep | BEST | Albue | Albuen bevæger sig frem under holdet | Albuens retning bagud |
| Intet collapse | Skytten, BEST | Albue | Albuen bevæger sig frem i slippet | Albuens retning bagud |
| Rekyl bagud i pilens plan | BEST | Albue | Første bevægelse efter slippet er ikke bagud langs pilens linje | Albuens retning bagud |
| Albuen falder ikke i follow-through | BEST | Albue | Albuen falder over grænse i 1–2 s efter slippet | Kun tyngdekraft |
| Hold til slip 1–3 s | BEST | Bue | Tid fra roligt hold til slip uden for 1–3 s | Kun tider |

Albuens retning "bagud" kan appen selv finde: under trækket bevæger albuen sig bagud.

**Ikke regler endnu** (vises som tal, men dømmes ikke):
- "Roligere hen mod slippet". **[Gæt]**, og BEST siger, at sigtet må bevæge sig lidt.
- Variation i tempo. Studierne er uenige.
- Jævn bevægelse efter slippet. **[Ét studie]**, kun compound.

## Det, vi ikke ved endnu

- **Cant og op/ned ad bakke er ikke dækket af BEST/KSL.** Reglerne om cant bygger på din vurdering og fysikken. Reglen om at bøje i hoften er bekræftet af dig. World Archery's Coach's Manual blev ikke læst: filen er for stor til mit værktøj, og kapitlet om recurve-form kunne ikke hentes for sig. Det kan stadig tjekkes, hvis du har den.
- **BEST og KSL er samme skole.** BEST bygger på Kisik Lee's metode, så de to er ikke uafhængige kilder. Du har godkendt materialet som pålideligt.
- **Ingen absolutte grænser fra forskningen** for buens udsving i grader eller °/s. Studierne sammenligner grupper. Grænserne må findes på dine egne optagelser og senere på andre skytter.
- **Buens bevægelse i slippet afhænger af udstyret**: stabilisatorer, vægte, buesling og trækvægt.
- **Barebow er sparsomt beskrevet.** Det meste forskning er på recurve med sigte og compound. String-walking kan påvirke slippet.

## Næste skridt

1. Find buens akser i optagelserne (afsnit 3 i planen), så cant, op/ned og venstre/højre kan regnes ud.
2. Tjek om MantisX' vinkler er præcise nok til at måle cant på 1°.
3. Vis reglerne i analysebænken på rigtige optagelser, og sæt grænserne ud fra dem.
4. Hvis du har adgang til en skytte eller træner med god form, vil optagelser med begge sensorer være meget værdifulde som reference.
