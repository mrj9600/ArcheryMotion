# Den gode form set med sensorer

Dette dokument beskriver, hvordan den gode form ser ud i data fra sensoren på buen og sensoren på trækalbuen. Det bygger på trænermateriale og studier. Det er udgangspunktet for appens **teknikregler** (se [vision-og-plan.md](vision-og-plan.md), afsnit 5).

Tallene er **startværdier**. Forskningen giver mest retninger ("mindre er bedre", "bagud, ikke frem") og meget få grænseværdier. Grænserne skal derfor justeres på rigtige optagelser i analysebænken. Hvor et tal kommer fra en kilde, står det ved tallet.

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

- **Cant sættes før trækket og ændres ikke under trækket.** Cant, der ændrer sig under trækket, skyldes typisk greb eller håndled.
- Buearmen peger mod målet hele vejen. Buen bevæger sig mest op/ned (pitch) ind mod målet og kun lidt sideværts.
- Trækalbuen bevæger sig bagud og rundt, til den ligger i linje bag pilen.

### 2. Anker, sigte og hold

**Buen:**
- **Lav og faldende vinkelhastighed.** Bevægelsen skal blive mindre hen mod slippet, ikke større. Det er SCATT's koordinationsdiagram: en kurve, der stiger til sidst, betyder at buen bevæger sig væk fra sigtet lige før slippet.
  - Studier af eliteskytter: mindre bevægelse af buen og mindre rysten under sigtet giver bedre præcision ([Kim m.fl. 2025](https://pubmed.ncbi.nlm.nih.gov/39998444)). Begyndere har mest variation i lodret retning ([PMC11235681](https://pmc.ncbi.nlm.nih.gov/articles/PMC11235681)).
  - Startværdi: udsving (lavfrekvent) under ca. 3 °/s og rysten (højfrekvent) under ca. 2 °/s i det sidste sekund. Skal sættes efter rigtige data.
- **Cant stabil og aldrig mod pilens side.**
  - Lodret (0°) eller en lille, bevidst cant væk fra pilens side er i orden. Barebow- og traditionelle skytter bruger ofte en fast cant ([Legend Archery](https://legendarchery.com/en-ca/pages/cant)), og når toppen hælder væk fra pilens side, holder tyngdekraften pilen mod buen ([rokslide](https://rokslide.com/forums/threads/cant-question.167227)).
  - Cant mod pilens side giver risiko for, at pilen falder af hylden. Startværdi for fejl: mere end 1° mod pilens side.
  - Variation fra skud til skud: inden for ±1°.
- **Ingen drift.** Ændring i cant og op/ned under holdet: under ca. 1°.

**Trækalbuen:**
- **Bevæger sig langsomt bagud og rundt (ekspansion), aldrig frem (creep).** Rotationen af albuens sensor har altså en fast retning under holdet. Fortegnet skifter, hvis albuen kryber frem.
- Rolig. En gennemgang af studier angiver vinkeludsving under 0,5° hos eliteskytter mod op til 3,5° hos begyndere i trækarmen under holdet. Det tal har jeg ikke kunnet finde i en primær kilde, så det er kun vejledende.
- Albuens højde i forhold til pilen (via tyngdekraften) er den samme fra skud til skud og ligger på linje med pilen eller lidt over (afsnit 7 i planen).

### 3. Slippet

Slippet er det vigtigste øjeblik for de fleste teknikregler. Her ses den største forskel mellem god og dårlig form.

**Buen:**
- **Buen bevæger sig fremad mod målet.** Når grebet er afslappet, trækker strengen buen frem. Accelerationen er størst langs pilens akse, med kun lidt sideværts og lodret.
  - Eliteskytter spænder strækkemusklerne i hånden, så de ikke griber om buen ([Archery Skill Assessment Using an Acceleration Sensor](https://www.researchgate.net/publication/349147216_Archery_Skill_Assessment_Using_an_Acceleration_Sensor)). Det giver en ren bevægelse fremad.
- **Buen tipper frem** (rotation om sideaksen, toppen frem mod målet). Det er normalt og ønsket med en buesling.
- **Lille rotation om håndsektionens akse og lille cant-ændring.** En stor rotation til venstre/højre eller et ryk i cant betyder torque fra grebet.
- **Buen må ikke bevæge sig før slippet.** Hvis buen falder, løftes eller drejer i de sidste ca. 0,2 s før slippet, foregriber skytten slippet (fx kigger efter pilen eller presser).

**Trækalbuen:**
- **Bagud, ikke frem.** I slippet fortsætter trækhånd og albue bagud langs linjen. Hånden glider tilbage langs ansigt og hals ([North American Whitetail](https://www.northamericanwhitetail.com/editorial/huntingtactics_naw_archery_0208/263900), [Legend Archery](https://legendarchery.com/blogs/archery-bowhunting-blog/recurve-archery-release-technique)).
- **Collapse er bevægelse fremad mod målet i slippet.** Det betyder, at rygspændingen er tabt ([Archery360](https://archery360.com/?p=94966)). I data ses det som acceleration eller rotation af albuens sensor *fremad*, eller at bevægelsen bagud stopper og vender lige før slippet. **Det er altid en fejl**, også hvis det sker hver gang.

### 4. Follow-through

- **Buearmen bliver oppe og peger mod målet**, til pilen rammer, eller i ca. 1–2 s ([Mississippi State](https://extension.msstate.edu/sites/default/files/document/2025-10/P1564_web_1.pdf)).
  - Efter buens naturlige tip frem må buens retning (op/ned og venstre/højre) ikke falde eller svinge brat i det første halve sekund.
  - Buearmen må gerne følge med frem mod målet ([tifam](https://tifam.ie/you-are-a-spring-under-tension/)).
- **Trækhånden ender bag hovedet** og bliver der. Albuens sensor ligger roligt efter bevægelsen bagud.
- **Glat og ens, ikke stiv.** For compound er en jævn og ensartet bevægelse efter slippet vigtigere end at holde helt stille ([Kim m.fl. 2025](https://pubmed.ncbi.nlm.nih.gov/39998444)). For recurve er stabilitet fra slippet og frem vigtigere end for compound ([MDPI 2025](https://www.mdpi.com/2075-4663/13/9/310)).

### 5. Tid og rytme

- **Tid fra anker til slip skal være ens fra skud til skud.** Variationen i tid fra klikker til slip hænger sammen med pointene hos de bedste skytter ([Callaway m.fl.](https://eprints.bournemouth.ac.uk/24308/7/Callaway_Archery_ArchiveCopy.pdf)).
  - Kortere sigtetid går generelt sammen med bedre præcision ([Frontiers 2025](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1650300/full)), men ikke i alle studier.
  - Appen bruger skyttens eget tempo som mål og advarer, når holdet bliver meget længere end normalt.
- **Slippet kommer hurtigt efter klikkeren**, hvis der bruges klikker (ca. 100 ms hos eliteskytter mod 200 ms hos begyndere, [Clarys m.fl.](https://www.researchgate.net/publication/324161306_Muscular_coordination_of_movements_associated_with_arrow_release_in_archery)). Barebow har normalt ingen klikker. Så bruges tiden fra roligt hold til slip i stedet.

### 6. Op og ned ad bakke (felt og 3D)

- **T-formen bevares ved at bøje i hoften.** Uden sensor på overkroppen ses det indirekte: cant og trækalbuens højde i forhold til buen skal være de samme, uanset om målet står højt eller lavt.
- **Cant ændrer sig ikke med målets højde.** Mange skytter kanter mere, når de skyder ned ad bakke. Det fanger højde-analysen.

## Hvornår er pilen fri af buen?

Skytten påvirker kun pilen, så længe pilen rører strengen eller buen. Bevægelser senere kan ikke ændre pilens flugt. De er stadig vigtige, fordi de viser, hvilke kræfter der virkede i slippet, og fordi en god follow-through giver et godt slip.

**Hvad målingerne siger (recurve, højhastighedsvideo):**
- Pilen forlader strengen ca. **15–20 ms** efter, at slippet begynder, både for recurve og compound ([Park 2012](https://www.researchgate.net/publication/258178764_High-speed_video_analysis_of_arrow_behaviour_during_the_power_stroke_of_a_recurve_archery_bow)). Et studie af trænede skytter angiver under 16 ms kontakt mellem streng og pil ([arXiv 2402.12389](https://arxiv.org/pdf/2402.12389)).
- Hurtigste måling blandt 16 skytter var 7,5 ms fra slippet begyndte (Park 2012).
- Pilens kontakt med plungeren var slut inden for ca. **8 ms** (Park 2012), fordi pilen bøjer sig rundt om buen (*archer's paradox*).

**Overslag for en barebow-skytte.** Med fx 71 cm træklængde og 22 cm stavhøjde bliver trækslaget ca. 49 cm:
- Pilen når fx 55 m/s (ca. 180 fps) og har gennemsnitligt halv fart under trækslaget. Det giver ca. 0,49 / 27,5 ≈ **18 ms** på strengen, altså samme størrelse som målingerne.
- Når nocken forlader strengen, er den stadig ca. en stavhøjde bag grebet. Den skal tilbagelægge ca. 22 cm mere for at komme forbi hylden. Med 55 m/s tager det ca. **4 ms**.
- **Pilen er helt fri af buen ca. 20–25 ms efter, at slippet begynder.** Mest tid ved lav trækvægt, kort træklængde og tunge pile.

**Hvad det betyder for appen:**
- **Det afgørende vindue er de sidste ca. 50 ms før og de første ca. 25 ms efter slippet.** Bevægelser i dette vindue påvirker pilen direkte. Reglen "ingen bevægelse før slippet" (sidste 0,2 s) fanger det, der fører op til vinduet.
- **Det store ryk i buens accelerometer kommer, når benene stopper ved stavhøjden.** Det er omtrent der, pilen forlader strengen. Appens slip-tidspunkt ligger derfor ca. 15–20 ms *efter*, at fingrene åbner sig. Buen begynder allerede at bevæge sig fremad, når fingrene slipper, fordi buearmens tryk ikke længere modsvares af strengen. Den første lille fremadgående acceleration før rykket er altså det egentlige slip.
- **Sensorernes hastighed:**
  - MantisX måler ved ca. 340 Hz (3 ms mellem målinger), så vinduet dækkes af 7–8 målinger.
  - WitMotion kører typisk ved 100–200 Hz (5–10 ms), så vinduet dækkes kun af 2–5 målinger.
  - Til at se hvad der sker *i* vinduet er MantisX på buen bedst. WitMotion rækker til før og efter.
  - Tidsstemplerne fra BLE har desuden en usikkerhed på flere millisekunder. Det er nok til at se bevægelser omkring vinduet, men ikke til at sige præcist, hvornår i vinduet de sker.
- **Hvad follow-through fortæller:** en drejning af buen eller et collapse, der ses 50–200 ms efter slippet, er startet af kræfter, der virkede i vinduet. Follow-through er altså et forstørrelsesglas på slippet.
- **Udstyret bestemmer tiden.** Når appen kender træklængde, trækvægt, stavhøjde og pilens vægt (eller målt pilhastighed), kan den regne vinduet ud pr. opsætning. Stavhøjde og pilens vægt/hastighed bør derfor tilføjes til udstyrsopsætningen.

## Teknikregler, som appen kan tjekke

Reglerne gælder for alle skytter. Et brud er en fejl, også hvis det sker hver gang. Grænserne er startværdier.

| Regel | Sensor | Fejl når (startværdi) | Kræver |
|-------|--------|-----------------------|--------|
| Ingen cant mod pilens side | Bue | Cant > 1° mod pilens side under holdet | Buens akser, håndethed |
| Stabil cant under hold | Bue | Ændring > 1° fra anker til slip | Buens akser |
| Roligere hen mod slippet | Bue | Vinkelhastighed i sidste 0,3 s > 1,5 × gennemsnittet i sekundet før | Kun gyro |
| Ingen bevægelse før slippet | Bue | Op/ned eller venstre/højre ændrer sig > 0,5° i de sidste 0,2 s før slippet | Buens akser |
| Buen frem i slippet | Bue | Mindre end ca. 70 % af den første acceleration er langs pilens akse | Buens akser |
| Ingen torque i slippet | Bue | Rotation om håndsektionens akse eller cant-ryk over grænse (sættes fra data) | Buens akser |
| Buearmen bliver oppe | Bue | Pitch falder > ca. 5° i de første 0,5 s efter buens tip frem | Buens akser |
| Ingen creep | Albue | Albuen roterer frem under holdet | Albuens retning bagud (fra trækket) |
| Intet collapse | Albue | Albuen bevæger sig frem i slippet | Albuens retning bagud |
| Fortsat bagud i slippet | Albue | Ingen tydelig bevægelse bagud inden for 0,1 s efter slippet | Albuens retning bagud |
| Ens tempo | Bue | Anker til slip afviger > ca. 25 % fra skyttens normale tid | Kun tider |

Albuens retning "bagud" kan appen selv finde: under trækket bevæger albuen sig bagud. Det er den retning, der bruges som reference resten af skuddet.

## Det, vi ikke ved endnu

- **Ingen absolutte grænser fra forskningen** for buens udsving i grader eller °/s. Studierne sammenligner grupper. Grænserne må findes på dine egne optagelser og senere på andre skytter.
- **Buens bevægelse i slippet afhænger af udstyret**: stabilisatorer (barebow har ingen lange), vægte, buesling og trækvægt. Reglen "buen frem" er rigtig, men hvor meget og hvor hurtigt bliver forskelligt fra bue til bue. Det er derfor, reglerne knyttes til udstyrsopsætningen.
- **Barebow er sparsomt beskrevet.** Det meste forskning er på recurve med sigte og compound. String-walking flytter fx pilens vinkel i forhold til strengen og kan påvirke slippet.
- **Den gode form er ikke det samme som den optimale form for den enkelte.** Reglerne fanger tydelige fejl. Resten er konsistens omkring skyttens egen form.

## Næste skridt

1. Find buens akser i optagelserne (afsnit 3 i planen), så cant, op/ned og venstre/højre kan regnes ud.
2. Vis reglerne i analysebænken på rigtige optagelser, og sæt grænserne ud fra dem.
3. Hvis du har adgang til en skytte eller træner med god form, vil et par optagelser med begge sensorer være meget værdifulde som reference.
