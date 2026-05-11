/**
 * Task corpus for the German Spinner.
 *
 * Two corpora:
 *   - writingTasks: open-ended PoC writing prompts for everyday practice.
 *     Suitable for any student wanting to practice German writing.
 *   - examTasks: real Udir-style exam prompts (or Udir example exams) for
 *     students preparing for an actual eksamen.
 *
 * Same task shape in both:
 *   {
 *     id: string,                // stable; used as deck key
 *     year: number,
 *     term: 'vår' | 'høst' | 'eksempel',
 *     part: string,              // e.g. 'Del 2 – Skriftlig produksjon'
 *     title: string,
 *     prompt: string,            // task text; \n\n separates paragraphs
 *     image: null | (() => Promise<{ default: string }>),  // lazy SVG import
 *     modelAnswers: {
 *         simple: string,        // Tysk 1 grammar baseline:
 *                                // present tense, simple main clauses, no
 *                                // verb-final subordinate clauses, no Perfekt
 *                                // (Tysk 2 simple may use Perfekt + basic
 *                                //  weil/dass clauses since both are taught).
 *         rich: string,          // Translation-friendly draft that uses the
 *                                // full range of German structures the level
 *                                // supports (Perfekt, weil/dass, modal verbs,
 *                                // Komparativ/Superlativ, etc.).
 *     },
 *     attribution: string,       // e.g. 'Udir, Tysk 1, vår 2023'
 *   }
 *
 * Why two drafts: a Tysk 1 student who barely knows the grammar still needs
 * a model that's writable with what they've actually been taught. The
 * "simple" variant is calibrated to the Wir sprechen Deutsch 1 syllabus
 * (Präsens, modal verbs müssen/dürfen, Akk/Dat pronouns, reflexive verbs,
 * imperative, Komparativ/Superlativ; no Präteritum, no subordinate clauses).
 * The "rich" variant matches what a confident student would aim for.
 */

export const writingTasks = {
    'tysk-1': [
        {
            id: 'tysk1-seed-01',
            year: 2023,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Mein Lieblingsfest',
            prompt: 'Schreibe einen Text über dein Lieblingsfest. Was wird gefeiert? Mit wem feierst du? Was isst und trinkt man? Schreibe ungefähr 100 Wörter.',
            image: () => import('./german-exam-svg/birthday.js'),
            modelAnswers: {
                simple: 'Min favorittfest er bursdagen min. Jeg feirer hjemme. Familien min er der. Noen venner kommer også. Vi pynter stua med ballonger. Vi lager mye god mat. På bordet er det en kake. Moren min lager en sjokoladekake. Vi spiser også pizza. Vi drikker brus. Etter middagen åpner jeg gavene mine. Så spiller vi brettspill. Av og til ser vi en film sammen. Jeg er glad i bursdagen min. Alle de viktigste menneskene mine er der.',
                rich: 'Min favorittfest er bursdagen min. Jeg pleier å feire den hjemme sammen med familien og noen gode venner. Vi pynter stua med ballonger og lager mye god mat. Det viktigste på bordet er kake — moren min lager alltid en sjokoladekake til meg. Vi spiser også pizza og drikker brus. Etter middagen åpner jeg gavene mine, og så pleier vi å spille brettspill eller se en film sammen. Jeg liker bursdagen min fordi alle de viktigste menneskene i livet mitt er samlet på ett sted.',
            },
            attribution: 'Udir, Tysk 1, vår 2023 (PoC-eksempel)',
        },
        {
            id: 'tysk1-seed-02',
            year: 2022,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Ein Tag in deiner Stadt',
            prompt: 'Beschreibe einen typischen Tag in deiner Stadt. Was machen die Menschen? Wo triffst du deine Freunde? Was kann man dort essen und sehen?',
            image: () => import('./german-exam-svg/city.js'),
            modelAnswers: {
                simple: 'Byen min er ikke så stor. Om morgenen drar folk på jobb eller skole. Bussene er fulle. På ettermiddagen er gatene livlige. Jeg møter venner på en kafé i sentrum. Vi drikker kaffe. Vi snakker om alt mulig. I byen finnes mange små restauranter. Pizza og sushi er populært. I fint vær går vi en tur i parken. Om kvelden ser jeg ofte en film hjemme. Noen ganger drar jeg på kino.',
                rich: 'En vanlig dag i byen min starter ganske rolig. Folk drar på jobb eller skole, og bussene er fulle om morgenen. På ettermiddagen blir gatene mer livlige. Jeg pleier å møte vennene mine på en kafé i sentrum. Der drikker vi kaffe og snakker om alt mulig. I byen finnes det mange små restauranter med god mat — særlig pizza og sushi er populært blant ungdom. Hvis været er fint, går vi en tur i parken etterpå. Om kvelden kan man se en film på kinoen eller bare slappe av hjemme.',
            },
            attribution: 'Udir, Tysk 1, høst 2022 (PoC-eksempel)',
        },
        {
            id: 'tysk1-seed-03',
            year: 2024,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Reiseplan',
            prompt: 'Du planst eine Reise mit deiner Klasse nach Berlin. Schreibe einen kurzen Plan: Was möchtet ihr sehen? Wo wohnt ihr? Wie kommt ihr dahin?',
            image: () => import('./german-exam-svg/berlin.js'),
            modelAnswers: {
                simple: 'Klassen min planlegger en tur til Berlin. Vi reiser med fly fra Oslo. Turen tar to timer. I Berlin bor vi på et ungdomsherberge i sentrum. Slik er det enkelt å komme seg rundt. På programmet står flere kjente steder. Vi besøker Brandenburger Tor. Vi ser på Berlinmuren. En hel dag er vi på Pergamonmuseet. Om kvelden spiser vi tysk mat på en restaurant. Læreren planlegger også en tur til en park. Da kan vi slappe av før vi reiser hjem.',
                rich: 'Klassen min planlegger en tur til Berlin neste vår. Vi skal reise med fly fra Oslo, og det tar omtrent to timer. I Berlin skal vi bo på et ungdomsherberge i sentrum, slik at det er enkelt å komme seg rundt. På programmet står flere kjente steder. Vi vil besøke Brandenburger Tor og se restene av Berlinmuren. En hel dag skal brukes på museer, særlig Pergamonmuseet. På kvelden ønsker vi å spise tysk mat på en vanlig restaurant. Læreren har også planlagt en tur til en park, slik at vi kan slappe av før vi reiser hjem.',
            },
            attribution: 'Udir, Tysk 1, vår 2024 (PoC-eksempel)',
        },
        {
            id: 'tysk1-seed-04',
            year: 2023,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Mein bester Freund / meine beste Freundin',
            prompt: 'Erzähle über deinen besten Freund oder deine beste Freundin. Wie sieht er/sie aus? Was macht ihr zusammen? Warum mögt ihr euch?',
            image: () => import('./german-exam-svg/friends.js'),
            modelAnswers: {
                simple: 'Den beste vennen min heter Lukas. Han er like gammel som meg. Han bor i nabolaget mitt. Han er ganske høy. Han har mørkt hår og brune øyne. Lukas er alltid blid. Vi kjenner hverandre godt. Vi gjør mye sammen. Vi spiller fotball på det samme laget. Om vinteren går vi ofte på ski. Hjemme hos ham ser vi filmer. Vi spiller TV-spill. Vi har samme humor. Vi stoler på hverandre.',
                rich: 'Den beste vennen min heter Lukas. Han er like gammel som meg og bor i nabolaget. Han er ganske høy, har mørkt hår og brune øyne. Lukas er alltid blid og tar vare på dem rundt seg. Vi har kjent hverandre siden barneskolen og gjør mye sammen. Vi spiller fotball på det samme laget, og om vinteren går vi ofte på ski. Hjemme hos ham pleier vi å se filmer og spille TV-spill. Vi kommer godt overens fordi vi er ærlige med hverandre og har den samme humoren. Det er godt å ha en venn man kan stole på.',
            },
            attribution: 'Udir, Tysk 1, høst 2023 (PoC-eksempel)',
        },
        {
            id: 'tysk1-seed-05',
            year: 2024,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Schule und Freizeit',
            prompt: 'Schreibe über deinen Schulalltag und deine Freizeit. Wann beginnt die Schule? Welche Fächer magst du? Was machst du nach der Schule?',
            image: () => import('./german-exam-svg/school.js'),
            modelAnswers: {
                simple: 'Skoledagen min begynner klokken halv ni. Den slutter rundt halv tre. Vi har seks timer hver dag. Imellom er det korte pauser. Yndlingsfaget mitt er historie. Læreren forteller spennende historier. Jeg liker også engelsk og kroppsøving. Matematikk er litt vanskelig. Etter skolen gjør jeg lekser. Tre dager i uken trener jeg fotball. På fredager møter jeg vennene mine. Om kvelden hjelper jeg av og til til hjemme. Av og til leser jeg en bok.',
                rich: 'Skoledagen min begynner klokken halv ni og slutter rundt halv tre. Vi har vanligvis seks timer hver dag, og imellom er det korte pauser. Yndlingsfaget mitt er historie, fordi læreren vår forteller spennende historier. Jeg liker også engelsk og kroppsøving. Matematikk synes jeg er litt vanskelig, men det går greit. Etter skolen pleier jeg å gjøre lekser først, slik at jeg har resten av kvelden fri. Tre dager i uken trener jeg fotball, og på fredager møter jeg vennene mine. Om kvelden hjelper jeg av og til til hjemme før jeg slapper av med en bok eller serie.',
            },
            attribution: 'Udir, Tysk 1, høst 2024 (PoC-eksempel)',
        },
        {
            id: 'tysk1-practice-06',
            year: 2025,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Meine Woche ohne Handy',
            prompt: 'Stell dir vor, du hast eine Woche lang kein Handy. Schreibe einen Text darüber.\n\nSchreibe über:\n- was am Anfang schwierig ist\n- was du stattdessen machst\n- ob du am Ende etwas gelernt hast',
            image: () => import('./german-exam-svg/social-media.js'),
            modelAnswers: {
                simple: 'I en uke har jeg ikke mobiltelefon. I begynnelsen er det vanskelig. Jeg sjekker vanligvis meldinger hele tiden. Jeg kan ikke høre på musikk på bussen. Jeg vet ikke alltid hva vennene mine gjør. Etter to dager blir det lettere. Jeg leser mer. Jeg spiller kort med familien. Jeg går tur etter skolen. Når jeg vil snakke med en venn, møter jeg vennen ute. På slutten har jeg mer ro. Jeg lærer at mobilen er nyttig, men jeg trenger den ikke hvert minutt.',
                rich: 'I en uke har jeg ikke mobiltelefon. I begynnelsen er det ganske vanskelig, fordi jeg vanligvis sjekker meldinger hele tiden. Jeg kan ikke høre på musikk på bussen, og jeg vet ikke alltid hva vennene mine gjør. Etter to dager blir det litt lettere. Jeg leser mer, spiller kort med familien og går tur etter skolen. Når jeg vil snakke med en venn, ringer jeg fra telefonen til moren min eller møter vennen ute. På slutten merker jeg at jeg har mer ro. Jeg lærer at mobilen er nyttig, men at jeg ikke trenger den hvert minutt.',
            },
            attribution: 'Papertek, Tysk 1 skriveøvelse 2025',
        },
        {
            id: 'tysk1-practice-07',
            year: 2025,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Ein Austauschschüler kommt',
            prompt: 'Ein Austauschschüler aus Deutschland kommt für drei Tage zu dir. Schreibe eine E-Mail und erzähle, was ihr zusammen machen könnt. Beschreibe auch dein Zuhause und deine Familie.',
            image: () => import('./german-exam-svg/friends.js'),
            modelAnswers: {
                simple: 'Hei Max,\n\nJeg gleder meg til besøket ditt. Du bor hos familien min i tre dager. Vi bor i et lite hus nær skolen. Jeg har et eget rom. Du kan sove på en madrass der. Familien min er mor, far, lillesøsteren min og meg. Den første dagen går vi en tur i sentrum. Vi spiser pizza. På lørdag viser jeg deg fjorden og fotballbanen. I dårlig vær ser vi en film hjemme. Jeg håper du får en fin tid hos oss.\n\nHilsen\n[ditt navn]',
                rich: 'Hei Max,\n\nJeg gleder meg til at du kommer på besøk til oss. Du skal bo hjemme hos familien min i tre dager. Vi bor i et lite hus nær skolen. Jeg har et eget rom, og du kan sove på en madrass der. Familien min består av mor, far, lillesøsteren min og meg. Den første dagen kan vi gå en tur i sentrum og spise pizza. På lørdag vil jeg vise deg fjorden og fotballbanen der jeg trener. Hvis været er dårlig, kan vi se en film hjemme. Jeg håper du får en fin tid hos oss.\n\nHilsen\n[ditt navn]',
            },
            attribution: 'Papertek, Tysk 1 skriveøvelse 2025',
        },
        {
            id: 'tysk1-practice-08',
            year: 2025,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Im Restaurant',
            prompt: 'Du bist mit deiner Familie in einem Restaurant. Erzähle, was ihr bestellt, wie das Essen schmeckt und was während des Besuchs passiert.',
            image: () => import('./german-exam-svg/birthday.js'),
            modelAnswers: {
                simple: 'I helgen går jeg på restaurant med familien min. Vi feirer bursdagen til søsteren min. Restauranten ligger i sentrum. Den er liten, men koselig. Jeg bestiller pasta med tomatsaus. Foreldrene mine spiser fisk. Søsteren min vil ha hamburger og pommes frites. Maten smaker godt. Servitøren glemmer drikken vår. Etterpå kommer han tilbake og sier unnskyld. Til dessert deler vi en sjokoladekake. Alle synger for søsteren min. Jeg liker kvelden.',
                rich: 'I helgen går jeg på restaurant med familien min. Vi feirer bursdagen til søsteren min. Restauranten ligger i sentrum og er ganske liten, men koselig. Jeg bestiller pasta med tomatsaus, mens foreldrene mine spiser fisk. Søsteren min vil ha hamburger og pommes frites. Maten smaker veldig godt, men servitøren glemmer først drikken vår. Etterpå kommer han tilbake og sier unnskyld. Til dessert deler vi en stor sjokoladekake. Søsteren min får også et lite lys på kaken, og alle synger for henne. Jeg liker kvelden fordi vi har god tid og snakker mye sammen.',
            },
            attribution: 'Papertek, Tysk 1 skriveøvelse 2025',
        },
        {
            id: 'tysk1-practice-09',
            year: 2025,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Ein Schulfest planen',
            prompt: 'Deine Klasse plant ein Schulfest. Schreibe eine kurze Nachricht an eine deutsche Partnerklasse.\n\nErkläre:\n- wann und wo das Fest ist\n- was die Schüler machen können\n- was die Gäste mitbringen sollen',
            image: () => import('./german-exam-svg/school.js'),
            modelAnswers: {
                simple: 'Hei alle sammen,\n\nKlassen vår planlegger en skolefest fredag 12. september. Festen begynner klokken seks. Den er i gymsalen på skolen vår. Vi inviterer partnerklassen fra Tyskland. På festen kan elevene spise sammen. Vi hører på musikk og spiller spill. Vi lager også en quiz om Norge og Tyskland. Ta gjerne med noe lite å spise fra hjemlandet deres. Husk varme klær. Kanskje går vi ut senere. Vi håper dere kan komme.\n\nVennlig hilsen\nklasse 10B',
                rich: 'Hei alle sammen,\n\nKlassen vår planlegger en skolefest fredag 12. september. Festen begynner klokken seks og er i gymsalen på skolen vår. Vi vil gjerne invitere partnerklassen fra Tyskland. På festen kan elevene spise sammen, høre på musikk og spille forskjellige spill. Vi lager også en liten quiz om Norge og Tyskland. Dere trenger ikke ta med mye. Ta gjerne med noe lite å spise fra hjemlandet deres, for eksempel kake eller snacks. Husk også varme klær, fordi vi kanskje går ut senere på kvelden. Vi håper dere kan komme.\n\nVennlig hilsen\nklasse 10B',
            },
            attribution: 'Papertek, Tysk 1 skriveøvelse 2025',
        },
    ],
    'tysk-2': [
        {
            id: 'tysk2-seed-01',
            year: 2023,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Umweltschutz im Alltag',
            prompt: 'Wie kann man im Alltag die Umwelt schützen? Beschreibe konkrete Beispiele aus deinem eigenen Leben und diskutiere, was junge Menschen tun können.',
            image: () => import('./german-exam-svg/environment.js'),
            modelAnswers: {
                simple: 'Klima er viktig for alle. Hver dag kan jeg gjøre litt. Jeg sykler eller går til skolen. Foreldrene mine kjører meg ikke. Hjemme sorterer vi søppel. Vi kaster mindre mat. Jeg dusjer kortere. Jeg slår av lyset. Unge mennesker kan også gjøre mye. Vi velger brukte klær. Vi spiser mindre kjøtt. Vi tar bussen. Jeg engasjerer meg politisk. Politikerne må ta klima på alvor. Små vaner blir til store endringer.',
                rich: 'Klimaet er en av de største utfordringene i vår tid, og alle kan bidra litt. Selv prøver jeg å sykle eller gå til skolen i stedet for å bli kjørt. Hjemme sorterer vi søppel, og vi prøver å kaste mindre mat. Jeg dusjer kortere og slår av lyset når jeg går ut av et rom. Unge mennesker har en viktig rolle. Vi kan velge brukte klær framfor nye, spise mindre kjøtt og bruke kollektivtransport. Vi kan også engasjere oss politisk og kreve at de som styrer tar klima på alvor. Små vaner i hverdagen blir til store endringer når mange gjør det samme.',
            },
            attribution: 'Udir, Tysk 2, vår 2023 (PoC-eksempel)',
        },
        {
            id: 'tysk2-seed-02',
            year: 2022,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Soziale Medien — Vor- und Nachteile',
            prompt: 'Soziale Medien sind ein wichtiger Teil im Leben vieler Jugendlichen. Schreibe einen Text, in dem du die Vor- und Nachteile diskutierst und deine eigene Meinung gibst.',
            image: () => import('./german-exam-svg/social-media.js'),
            modelAnswers: {
                simple: 'Sosiale medier er en del av livet. Det finnes gode og dårlige sider. Jeg holder kontakt med venner og familie. Jeg deler bilder. Jeg ser nyheter hver dag. Jeg lærer nye ting. Mange bruker for mye tid på telefonen. Det fører til dårlig søvn. Mange beveger seg lite. Bilder på nettet er ofte perfekte. Det er ikke virkeligheten. Mobbing på nett er et problem. Jeg synes sosiale medier er nyttige. Jeg bruker dem med måte.',
                rich: 'Sosiale medier er en stor del av livet til de fleste ungdommer. Det finnes både gode og dårlige sider ved dem. På den positive siden gjør de det enkelt å holde kontakt med venner og familie. Man kan dele bilder, se nyheter og lære nye ting hver dag. På den negative siden bruker mange altfor mye tid på telefonen. Det kan føre til dårlig søvn, mindre fysisk aktivitet og press fra perfekte bilder. Mobbing på nett er også et alvorlig problem. Selv mener jeg at sosiale medier er nyttige hvis man bruker dem med måte. Det viktigste er å være kritisk til det man ser og å huske at livet utenfor skjermen også er viktig.',
            },
            attribution: 'Udir, Tysk 2, høst 2022 (PoC-eksempel)',
        },
        {
            id: 'tysk2-seed-03',
            year: 2024,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Eine Reise, die mich geprägt hat',
            prompt: 'Schreibe über eine Reise, die du nicht vergessen wirst. Wohin bist du gefahren? Was hast du erlebt? Wie hat dich die Reise verändert?',
            image: () => import('./german-exam-svg/journey.js'),
            modelAnswers: {
                simple: 'Jeg har vært i Italia med familien min. Det var sommeren da jeg var fjorten. Alt var nytt for meg. Språket var annerledes. Byen luktet annerledes. Det var veldig varmt. Vi har bodd en uke i Roma. Vi har sett Colosseum. Vi har vært i Vatikanet. Etter Roma har vi vært i en kystby. Vi har badet hver dag. Folk var vennlige. Reisen har endret meg. Nå vil jeg reise mer. Jeg vil lære flere språk.',
                rich: 'Sommeren da jeg var fjorten år, reiste jeg med familien min til Italia. Det var første gang jeg var ute av Norden, og alt virket annerledes — språket, lukten av byen, varmen. Vi bodde en uke i Roma og besøkte Colosseum og Vatikanet. Senere dro vi til en liten kystby der vi badet hver dag. Det som gjorde sterkest inntrykk på meg, var hvor vennlige folk var, selv om vi knapt snakket språket. Etter den turen begynte jeg å bli mer interessert i andre kulturer. Jeg leste mer, så filmer på originalspråket og fikk lyst til å lære flere språk. Reisen forandret hvordan jeg ser på verden og på mitt eget liv hjemme.',
            },
            attribution: 'Udir, Tysk 2, vår 2024 (PoC-eksempel)',
        },
        {
            id: 'tysk2-seed-04',
            year: 2023,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Zukunftspläne nach der Schule',
            prompt: 'Was möchtest du nach der Schule machen? Studieren, arbeiten oder reisen? Beschreibe deine Pläne und begründe deine Wahl.',
            image: () => import('./german-exam-svg/future.js'),
            modelAnswers: {
                simple: 'Etter skolen vil jeg ta et friår. Jeg planlegger å jobbe noen måneder. Jeg vil spare penger. Etterpå vil jeg reise i Europa. Jeg reiser med tog. Jeg vil lære bedre tysk og spansk. Kanskje tar jeg et språkkurs i Berlin. Etter friåret vil jeg studere medisin. Det er et tøft studium. Jeg vil hjelpe mennesker. Jeg liker biologi og kjemi. Kanskje kommer jeg ikke inn med en gang. Da studerer jeg noe annet i helse. Det viktigste er meningsfylt arbeid.',
                rich: 'Når jeg er ferdig på videregående, vil jeg ta et friår før jeg begynner å studere. I løpet av det året planlegger jeg å jobbe noen måneder for å spare penger, og deretter reise i Europa med tog. Jeg vil bruke tiden til å lære bedre tysk og spansk, kanskje gjennom et språkkurs i Berlin. Etter friåret håper jeg å studere medisin. Det er et tøft og langt studium, men jeg vil gjerne hjelpe mennesker, og jeg liker både biologi og kjemi. Hvis jeg ikke kommer inn på medisin med en gang, kan jeg studere noe annet innen helse i mellomtiden. Det viktigste for meg er å velge noe meningsfullt, ikke bare det som gir best lønn.',
            },
            attribution: 'Udir, Tysk 2, høst 2023 (PoC-eksempel)',
        },
        {
            id: 'tysk2-seed-05',
            year: 2024,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Multikulturelle Gesellschaft',
            prompt: 'Norwegen ist eine multikulturelle Gesellschaft. Schreibe einen Text, in dem du die Vorteile und Herausforderungen einer solchen Gesellschaft beschreibst.',
            image: () => import('./german-exam-svg/multicultural.js'),
            modelAnswers: {
                simple: 'Norge er et flerkulturelt samfunn. Mange mennesker fra ulike land bor her. Det har klare fordeler. Vi får ny mat og ny musikk. Barn vokser opp med ulike venner. Et mangfoldig samfunn er ofte mer åpent. Det finnes også utfordringer. Språk kan være en barriere. Noen er ikke en del av fellesskapet. Av og til oppstår misforståelser. Alle må bidra. Innvandrere må lære seg språket. Vi som bor her, må være åpne. Da blir ulikheter en styrke.',
                rich: 'Norge er i dag et flerkulturelt samfunn der mennesker fra mange land bor side om side. Det har klare fordeler. Vi får tilgang til ny mat, musikk og ideer, og barn vokser opp med venner som har ulike bakgrunner. Et mangfoldig samfunn er ofte mer kreativt og åpent. Samtidig finnes det utfordringer. Språk kan være en barriere, og noen opplever at de ikke blir helt en del av fellesskapet. Det kan også oppstå misforståelser når kulturer møtes. For at samfunnet skal fungere, må alle bidra. De som kommer hit, må lære seg språket og våre regler, mens vi som allerede bor her, må være åpne og inkluderende. Da kan ulikheter bli en styrke i stedet for et problem.',
            },
            attribution: 'Udir, Tysk 2, høst 2024 (PoC-eksempel)',
        },
        {
            id: 'tysk2-practice-06',
            year: 2025,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Digitale Schule',
            prompt: 'Viele Schulen benutzen Laptops, Tablets und digitale Lehrbücher. Schreibe einen Text, in dem du die Chancen und Probleme der digitalen Schule diskutierst. Gib am Ende deine eigene Meinung.',
            image: () => import('./german-exam-svg/school.js'),
            modelAnswers: {
                simple: 'Digitale verktøy er en vanlig del av skolen. De gir mange muligheter. Elever finner informasjon raskt. Vi skriver tekster mer effektivt. Vi leverer oppgaver uten papir. Digitale bøker kan ha videoer og lyd. Det hjelper mange elever. Samtidig finnes det problemer. Mange blir distrahert av spill, meldinger og sosiale medier. Noen lærer dårligere når de leser lange tekster på skjerm. Tekniske problemer tar også tid. Etter min mening bør skolen bruke digitale verktøy, men ikke hele tiden. Det beste er en blanding.',
                rich: 'Digitale verktøy er blitt en vanlig del av skolehverdagen. De gir mange muligheter. Elever kan finne informasjon raskt, skrive tekster mer effektivt og levere oppgaver uten papir. Digitale lærebøker kan også inneholde videoer og lyd, noe som hjelper ulike typer elever. Samtidig finnes det problemer. Mange blir lett distrahert av spill, meldinger og sosiale medier. Noen elever lærer dårligere når de leser lange tekster på skjerm. I tillegg kan tekniske problemer ta mye tid. Etter min mening bør skolen bruke digitale verktøy, men ikke hele tiden. Det beste er en blanding: skjerm når det gir mening, papir og samtale når det passer bedre.',
            },
            attribution: 'Papertek, Tysk 2 skriveøvelse 2025',
        },
        {
            id: 'tysk2-practice-07',
            year: 2025,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Nebenjob und Verantwortung',
            prompt: 'Viele Jugendliche möchten neben der Schule arbeiten. Schreibe über Vor- und Nachteile eines Nebenjobs. Würdest du selbst einen Nebenjob haben wollen? Begründe deine Meinung.',
            image: () => import('./german-exam-svg/summer-job.js'),
            modelAnswers: {
                simple: 'Mange ungdommer vil jobbe ved siden av skolen. En ekstrajobb kan være positiv. Man tjener egne penger. Man lærer å møte opp presis. Man får erfaring med voksne og kunder. Det kan også gjøre en mer selvstendig. Likevel finnes det ulemper. Skolen tar allerede mye tid. Hvis man jobber for mye, får man mindre tid til lekser, søvn og fritid. Noen blir stresset. Selv kunne jeg tenke meg en liten jobb i butikk eller på kafé. Jeg ville bare jobbet én dag i uken.',
                rich: 'Mange ungdommer ønsker å jobbe ved siden av skolen. En ekstrajobb kan være positiv. Man tjener egne penger, lærer å møte opp presis og får erfaring med voksne og kunder. Det kan også gjøre en mer selvstendig. Likevel finnes det ulemper. Skolen tar allerede mye tid, og hvis man jobber for mange timer, kan det gå utover lekser, søvn og fritid. Noen blir stresset fordi de prøver å rekke alt. Selv kunne jeg tenke meg en liten jobb, for eksempel i butikk eller på kafé. Jeg ville bare jobbet én dag i uken. Da kunne jeg lære ansvar uten at skolen ble et problem.',
            },
            attribution: 'Papertek, Tysk 2 skriveøvelse 2025',
        },
        {
            id: 'tysk2-practice-08',
            year: 2025,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Freundschaft und Konflikte',
            prompt: 'Freundschaften sind wichtig, aber manchmal gibt es Konflikte. Schreibe einen Text darüber, was eine gute Freundschaft ausmacht und wie man Konflikte lösen kann.',
            image: () => import('./german-exam-svg/friends.js'),
            modelAnswers: {
                simple: 'Vennskap betyr mye i ungdomstiden. En god venn er en person man kan stole på. Gode venner lytter. De er ærlige og prøver å forstå hverandre. Likevel kan det oppstå konflikter. Kanskje en venn sier noe sårende. Kanskje en venn glemmer en avtale. Da er det viktig å snakke sammen. Man bør forklare hvordan man føler det. Man må også høre på den andre. Å si unnskyld kan være vanskelig. Jeg mener at konflikter ikke trenger å ødelegge et vennskap. Noen ganger blir vennskapet sterkere.',
                rich: 'Vennskap betyr mye i ungdomstiden. En god venn er en person man kan stole på, også når man har en dårlig dag. Gode venner lytter, er ærlige og prøver å forstå hverandre. Likevel kan det oppstå konflikter. Kanskje en venn sier noe sårende, glemmer en avtale eller bruker for mye tid med andre. Da er det viktig å snakke sammen før problemet blir større. Man bør forklare hvordan man føler det, men også høre på den andre. Å si unnskyld kan være vanskelig, men det viser modenhet. Jeg mener at konflikter ikke trenger å ødelegge et vennskap. Noen ganger kan de gjøre vennskapet sterkere.',
            },
            attribution: 'Papertek, Tysk 2 skriveøvelse 2025',
        },
        {
            id: 'tysk2-practice-09',
            year: 2025,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Nachhaltig reisen',
            prompt: 'Reisen ist für viele Menschen wichtig. Gleichzeitig belastet Reisen oft die Umwelt. Diskutiere, wie man nachhaltiger reisen kann, und nenne konkrete Beispiele.',
            image: () => import('./german-exam-svg/journey.js'),
            modelAnswers: {
                simple: 'Å reise kan være lærerikt og spennende. Man møter nye mennesker. Man ser andre steder. Man forstår verden bedre. Samtidig kan reiser skade miljøet. Flyreiser er ofte et problem. Derfor bør vi tenke mer på hvordan vi reiser. Et konkret eksempel er tog i stedet for fly. Man kan også reise sjeldnere, men være borte lenger. På reisemålet bør man bruke buss, sykkel eller gå til fots. Det er også lurt å støtte lokale butikker. Jeg mener ikke at alle skal slutte å reise, men vi må reise med mer ansvar.',
                rich: 'Å reise kan være både lærerikt og spennende. Man møter nye mennesker, ser andre steder og forstår verden bedre. Samtidig kan reiser skade miljøet, særlig når vi flyr ofte og langt. Derfor bør vi tenke mer på hvordan vi reiser. Et konkret eksempel er å ta tog i stedet for fly når avstanden ikke er for stor. Man kan også reise sjeldnere, men være borte litt lenger. På reisemålet bør man bruke buss, sykkel eller gå til fots. Det er også lurt å støtte lokale butikker og ikke kaste søppel i naturen. Jeg mener ikke at alle skal slutte å reise, men vi må reise med mer ansvar.',
            },
            attribution: 'Papertek, Tysk 2 skriveøvelse 2025',
        },
    ],
};

/**
 * Real Udir exam tasks (or Udir example exams). Prompts are quoted verbatim.
 * Both modelAnswers variants are translation-friendly drafts written with
 * German word order in mind (V2, short SVO sentences) so students can
 * translate sentence-by-sentence.
 */
export const examTasks = {
    'tysk-1': [
        {
            id: 'tysk1-exam-2025-5',
            year: 2025,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 5: To personer du er mest sammen med',
            prompt: 'I denne oppgaven skal du skrive en tekst på 60–80 ord der du svarer på spørsmålene nedenfor.\n\n- Hvilke to personer er du mest sammen med?\n- Hvorfor er du sammen med dem?\n- Hva pleier dere å gjøre når dere er sammen?',
            image: null,
            modelAnswers: {
                simple: 'De to personene jeg er mest sammen med, er bestevennen min Mia og lillebroren min Jonas. Mia er hyggelig og morsom. Jeg kjenner henne fra barneskolen. Jonas er bare ti år. Jeg passer på ham etter skolen. Mia og jeg gjør lekser sammen. Vi går også på kafé. Med Jonas spiller jeg fotball i hagen. Av og til ser vi en film hjemme. Jeg er glad i begge to.',
                rich: 'De to personene jeg er mest sammen med, er bestevennen min Mia og lillebroren min Jonas. Mia kjenner jeg fra barneskolen, og hun er både morsom og snill. Jonas er bare ti år, men jeg har mye ansvar for ham etter skolen. Med Mia gjør jeg lekser, og vi går ofte på en kafé i sentrum. Med Jonas spiller jeg fotball i hagen eller ser en film hjemme. Jeg setter pris på dem fordi de er en stor del av hverdagen min.',
            },
            attribution: 'Udir, Tysk I (FSP6239 / PSP5838), eksamen våren 2025',
        },
        {
            id: 'tysk1-exam-2025-6',
            year: 2025,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 6: Melding til forelder med oppgaveliste',
            prompt: 'I denne oppgaven skal du skrive en melding på 100–120 ord.\n\nEn av foreldrene dine har en veldig stressende uke og ber deg om å hjelpe til med noen oppgaver. Du har fått en liste over ting du må gjøre innen dagen er over. Se på listen og skriv en melding der du forteller\n- hva du har gjort\n- hva du ikke har gjort, og hvorfor\n\nListe:\n- Vaske klær\n- Vaske hele kjøkkenet\n- Gå og handle melk, brød, kjøtt og kokosyoghurt\n- Hjelpe lillebror med leksene\n- Kjøpe en gave til onkel',
            image: null,
                modelAnswers: {
                simple: 'Hei mamma! Jeg vil fortelle hva jeg har gjort i dag. Først vasker jeg klær. Klærne henger nå til tørk. Etterpå handler jeg i butikken. Jeg kjøper melk, brød og kjøtt. Dessverre har de ikke kokosyoghurt. Jeg kjøper vanlig yoghurt i stedet. Senere kjøper jeg en gave til onkel. Jeg velger en bok om fotball. Det blir mer tid igjen. Kjøkkenet er ikke ferdig vasket. Lillebroren min er sulten. Han trenger mat først. Han vil ha hjelp med leksene senere i kveld. Hilsen meg.',
                rich: 'Hei mamma! Her er en kort oppdatering på dagen. Jeg har vasket klær, og de henger nå til tørk. Jeg har også vært i butikken og kjøpt melk, brød og kjøtt. Dessverre hadde de ikke kokosyoghurt i dag, så jeg kjøpte en vanlig yoghurt i stedet. Jeg fant også en fin gave til onkel — en bok om fotball som jeg tror han vil like. Kjøkkenet er jeg ikke helt ferdig med. Jeg har tørket benkene, men gulvet står igjen. Lillebroren min ble sulten da han kom hjem, så jeg lagde mat til ham først. Vi tar leksene sammen etter middag. Klem fra meg.',
            },
            attribution: 'Udir, Tysk I (FSP6239 / PSP5838), eksamen våren 2025',
        },
        {
            id: 'tysk1-exam-2025-7',
            year: 2025,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 7: Veska på bildet',
            prompt: 'I denne oppgaven skal du skrive en tekst på 160–180 ord.\n\nDu finner ei veske på bildet. Den inneholder flere forskjellige ting, blant annet noe som virkelig overrasker deg.\n\nSkriv en tekst der du har med de følgende punktene:\n- hvor du finner veska\n- hva den inneholder som overrasker deg, og hva denne tingen forteller deg om eieren\n- hva du gjør med veska',
            image: null,
            modelAnswers: {
                simple: 'En lørdag i mai går jeg en tur med hunden min. Vi går gjennom et stort jorde utenfor byen. Vinden er kald. Jeg ser plutselig noe brunt i graset. Det er ei gammel lærveske. Veska er stengt. Jeg åpner den forsiktig. Først ser jeg vanlige ting. Det er en bok og en penn. Det er også en gammel mobiltelefon. På bunnen finner jeg et helt spesielt brev. Brevet er skrevet på fransk. Det er fra 1955. Brevet er fra en mann som heter Pierre. Han skriver om kjærligheten sin. Det overrasker meg. Det betyr at eieren er glad i historie. Eieren er kanskje en eldre person. Jeg tar med veska hjem. Jeg viser den til foreldrene mine. De ringer politiet sammen med meg. Politiet kommer raskt. De skal finne eieren. Jeg er glad jeg hjelper noen i dag. Veska er ikke verdt mye penger. Men brevet er nok veldig viktig for eieren.',
                rich: 'En lørdag i mai går jeg en lang tur med hunden min utenfor byen. Stien går gjennom et stort jorde, og vinden er kald. Plutselig får hunden min øye på noe brunt mellom grasstråene. Det er ei gammel lærveske med en sliten skinnreim. Jeg åpner den forsiktig og blir både nysgjerrig og litt nervøs. Inni veska ligger ganske vanlige ting: en notatbok, en penn, et lommetørkle og en gammel mobiltelefon uten lader. Helt på bunnen finner jeg noe som overrasker meg veldig — et håndskrevet brev på fransk fra 1955. Det er underskrevet av en mann som heter Pierre, og han skriver om kjærligheten sin. Det forteller meg at eieren sannsynligvis er en eldre person som er glad i historie og minner. Jeg tar med veska hjem og viser den til foreldrene mine. Sammen ringer vi politiet, slik at de kan finne eieren. Selv om veska ikke er verdt mye penger, betyr nok brevet uendelig mye for noen.',
            },
            attribution: 'Udir, Tysk I (FSP6239 / PSP5838), eksamen våren 2025',
        },
        {
            id: 'tysk1-exam-2026-12',
            year: 2026,
            term: 'eksempel',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 12: Melding til tanten',
            prompt: 'I denne oppgaven skal du skrive en melding på 60–80 ord.\n\nDu har fått en melding fra tanten din der hun foreslår at du tilbringer neste helg hjemme hos henne. Du har ikke noe lyst til det, og dessuten har du andre planer allerede.\n\nSkriv et svar på meldingen fra tanten din der du\n- avslår invitasjonen hennes på en hyggelig måte\n- skriver hvilke planer du allerede har for neste helg\n- lover å besøke henne på et annet tidspunkt',
            image: null,
            modelAnswers: {
                simple: 'Kjære tante,\n\ntusen takk for den hyggelige invitasjonen din. Det var snilt av deg å tenke på meg. Dessverre passer det ikke for meg. Neste lørdag har en god venn bursdag. På søndag drar jeg på tur med familien min. Jeg foreslår en annen helg i mai. Da kommer jeg gjerne på besøk en hel dag. Jeg gleder meg til å se deg snart.\n\nMange klemmer\n[ditt navn]',
                rich: 'Kjære tante,\n\nTusen takk for den hyggelige invitasjonen din. Det var snilt av deg å tenke på meg. Dessverre passer det ikke for meg å komme neste helg. På lørdag feirer jeg bursdagen til en god venn. På søndag drar jeg på tur med familien min. Jeg foreslår en annen helg i mai. Da kommer jeg gjerne på besøk en hel dag. Jeg gleder meg til å se deg snart.\n\nMange klemmer\n[ditt navn]',
            },
            attribution: 'Udir, Tysk 1, eksempeloppgave 2026',
        },
        {
            id: 'tysk1-exam-2026-13',
            year: 2026,
            term: 'eksempel',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 13: Sommerjobb',
            prompt: 'I denne oppgaven skal du skrive en tekst på 140–160 ord.\n\nDu har nettopp begynt i en sommerjobb på et av disse stedene: SPAR (matbutikk), Petshop (kjæledyrbutikk), Regent Sport (sportsbutikk) eller Wiik Gård (gårdsbruk).\n\nSkriv en tekst der du forteller\n- hvor du jobber\n- hvilke arbeidsoppgaver du har\n- hva du har gjort på jobben i dag\n- om du liker jobben eller ikke, og hvorfor\n- hvordan du kommer deg til jobben\n- når du jobber, og hvor lenge du skal jobbe der',
            image: () => import('./german-exam-svg/summer-job.js'),
            modelAnswers: {
                simple: 'I sommer jobber jeg i en SPAR-butikk. Det er min første sommerjobb. Arbeidsoppgavene mine er enkle. Jeg fyller opp hyllene med varer. Jeg hjelper kundene. Av og til sitter jeg i kassa. I dag jobber jeg i frukt- og grøntavdelingen. Jeg pakker ut bananer, epler og grønnsaker. Etterpå rydder jeg tomme pappkasser i lageret. Jeg liker jobben. Kollegaene mine er hyggelige. Dagene går fort. Det er litt slitsomt å stå hele dagen. Jeg sykler til butikken hver morgen. Turen tar ti minutter hjemmefra. Jeg jobber tre dager i uken. Vaktene er fra klokken ni til halv fire. Jeg jobber der hele juli og august. Jeg snakker mest med voksne kunder. Jeg lærer mange nye navn på varene. Halvparten av pengene sparer jeg. Resten bruker jeg på en ny sykkel.',
                rich: 'I sommer har jeg en jobb i en SPAR-butikk i bygda mi. Det er min første sommerjobb. Arbeidsoppgavene mine er enkle. Jeg fyller opp hyllene med nye varer. Jeg hjelper kundene som leter etter noe. Av og til sitter jeg i kassa. I dag har jeg jobbet i frukt- og grøntavdelingen. Jeg pakket ut bananer, epler og grønnsaker. Etterpå ryddet jeg tomme pappkasser i lageret. Jeg liker jobben fordi kollegaene mine er veldig hyggelige. Dagene går fort, men det er litt slitsomt å stå hele dagen. Jeg sykler til butikken hver morgen. Turen tar omtrent ti minutter hjemmefra. Jeg jobber tre dager i uken. Vaktene er fra klokken ni til halv fire. Jeg skal jobbe der hele juli og august. Jeg snakker mest med voksne kunder, og jeg har lært mange nye navn på varene. Halvparten skal jeg spare, og resten bruker jeg på en ny sykkel.',
            },
            attribution: 'Udir, Tysk 1, eksempeloppgave 2026',
        },
    ],
    'tysk-2': [
        {
            id: 'tysk2-exam-2025-7',
            year: 2025,
            term: 'eksempel',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 7: Melding om kulturhus',
            prompt: 'I denne oppgaven skal du skrive en melding på 80–100 ord.\n\nPå vei hjem fra skolen i dag så du plakaten nedenfor. Skriv en melding til en venn der du\n- forteller kort hva som står på plakaten\n- forteller hvorfor du har lyst til å gå dit, og hva du vil gjøre der\n- spør om hen vil være med, og foreslår et tidspunkt\n\nPLAKAT — KULTURHUS FOR UNGDOM:\nUngdomsklubben er et gratis tilbud for ungdom i alderen 13–19 år. Alle som kommer, blir registrert og automatisk medlem. Medlemskapet er gratis. Vi har en kiosk hvor du kan kjøpe mat, drikke og godteri. Ta kontakt via Instagram.\n\nUngdomsklubben tilbyr bordtennis, biljard, gamingrom, musikkstudio, PlayStation, Nintendo, brettspill og mer! Velkommen til oss!\n\nÅpningstider: tirsdager og onsdager kl. 15–21, og annenhver fredag kl. 17–22 (8.11., 22.11., 6.12., 20.12.)\n\nOBS: Gamingrom og musikkstudio tilbys kun på fredager kl. 20–22.',
            image: null,
            modelAnswers: {
                simple: 'Hei! Jeg så en plakat om et kulturhus for ungdom. Det er gratis. Det er for unge mellom 13 og 19 år. Du kan spille bordtennis og biljard. Det finnes også et gamingrom og et musikkstudio. Det er en kiosk med mat og drikke. Klubben er åpen på tirsdager og onsdager fra klokken tre til ni. Annenhver fredag er det åpent fra klokken fem til ti. Jeg vil gjerne gå dit. Jeg liker å spille videospill. Vil du bli med? Hva med på fredag klokken åtte?',
                rich: 'Hei! Jeg så en plakat om et nytt kulturhus for ungdom på vei hjem fra skolen. Tilbudet er helt gratis og åpent for alle mellom 13 og 19 år. Der kan du spille bordtennis og biljard, men det finnes også et eget gamingrom, et musikkstudio og en kiosk hvor man kan kjøpe mat og drikke. Jeg har lyst til å gå dit fordi jeg er glad i videospill, og jeg vil gjerne prøve PlayStation og Nintendo sammen med deg. Klubben er åpen tirsdager og onsdager fra klokken 15 til 21, og annenhver fredag fra 17 til 22. Skal vi dra dit på fredag rundt klokken 20? Si fra hva du synes.',
            },
            attribution: 'Udir, Tysk II, eksempeloppgave høsten 2025',
        },
        {
            id: 'tysk2-exam-2025-8',
            year: 2025,
            term: 'eksempel',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 8: Tilbakemelding til restauranten',
            prompt: 'I denne oppgaven skal du skrive en tekst på 100–120 ord.\n\nDu og familien din var nylig på restaurant for å feire bursdagen til en av dere.\n\nSkriv en tilbakemelding til restauranten der følgende punkter er med:\n- hvordan maten smakte\n- hva dere synes om sørvisen og prisnivået\n- om du vil anbefale denne restauranten, og hvorfor / hvorfor ikke',
            image: null,
            modelAnswers: {
                simple: 'Familien min og jeg har vært på restaurant. Vi feiret bursdagen til lillesøsteren min. Maten var god. Jeg spiste pizza. Pizzaen var stor og varm. Søsteren min spiste pasta. Hun likte den. Sørvisen var også fin. Servitøren var hyggelig. Han var rask. Han smilte mye. Prisene var litt høye. En pizza kostet to hundre kroner. Det er mye. Jeg vil anbefale restauranten. Den har god mat. Sørvisen er hyggelig. Men du må regne med å bruke en del penger.',
                rich: 'Familien min og jeg var nylig på restauranten deres for å feire bursdagen til lillesøsteren min. Vi hadde det veldig hyggelig sammen. Maten smakte fantastisk — jeg bestilte pizza, og pasta-en til søsteren min var perfekt tilberedt. Også servitøren var hyggelig og oppmerksom; han kom raskt med drikke og forklarte menyen tydelig. Prisnivået var dessverre litt for høyt for oss. En pizza kostet rundt 200 kroner, og en hovedrett over 300. Likevel vil jeg anbefale restauranten til andre, særlig til spesielle anledninger eller når man vil ha en fin kveld ute. Maten og atmosfæren er virkelig verdt et besøk, hvis lommeboka tillater det.',
            },
            attribution: 'Udir, Tysk II, eksempeloppgave høsten 2025',
        },
        {
            id: 'tysk2-exam-2025-9',
            year: 2025,
            term: 'eksempel',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 9: Vennskapet som ble truet',
            prompt: 'I denne oppgaven skal du skrive en tekst på 140–160 ord.\n\nLucas, Nora og Sofia på bildet var gode venner, men det skjedde noe som truet vennskapet. Du er en av de tre.\n\nSkriv en tekst der du har med punktene nedenfor:\n- hva som skjedde\n- hvordan du reagerte\n- om dere fortsatt er venner i dag',
            image: null,
            modelAnswers: {
                simple: 'Lucas, Nora og jeg var bestevenner. Vi var alltid sammen. Vi spiste lunsj sammen på skolen. Vi gjorde lekser hjemme hos hverandre. Så skjedde det noe vondt. Lucas glemte bursdagen min. Nora kom heller ikke. Jeg var veldig trist. Jeg trodde de ikke brydde seg om meg. Jeg snakket ikke med dem på en uke. Etter en stund forklarte de hva som skjedde. Lucas hadde glemt det fordi han var syk. Nora hadde feber den dagen. De ba om unnskyldning. Vi snakket lenge sammen. De ga meg en gave senere. Vi reagerte alle ganske sterkt. Det var dumt av meg å bli så sint så fort. Vi er fortsatt venner i dag. Nå snakker vi mer åpent om problemer. Vennskapet vårt er sterkere nå. Jeg er glad for at vi løste dette.',
                rich: 'Lucas, Nora og jeg har vært bestevenner siden barneskolen. Vi gjorde alt sammen — spiste lunsj på skolen, lagde lekser hjemme hos hverandre og dro på kafé i helgene. Så skjedde det noe som virkelig truet vennskapet vårt: begge to glemte bursdagen min. Jeg ventet hele kvelden, men ingen av dem dukket opp eller sendte engang en melding. Jeg ble dypt såret og trakk meg fra dem i nesten en uke. Etter hvert kom det fram at Lucas hadde vært syk og Nora hadde fått feber samme dag, men ingen av dem hadde tenkt å gi beskjed. Vi snakket lenge ut om misforståelsen, og de ba ærlig om unnskyldning. Selv om jeg reagerte ganske kraftig, ser jeg nå at jeg burde ha spurt før jeg trakk meg unna. I dag er vi fortsatt venner — kanskje enda nærmere enn før. Vi har lært å snakke åpent og direkte om alt som skjer.',
            },
            attribution: 'Udir, Tysk II, eksempeloppgave høsten 2025',
        },
        {
            id: 'tysk2-exam-2025-eks-5',
            year: 2025,
            term: 'eksempel',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 5: Mindre skjermtid',
            prompt: 'I denne oppgaven skal du skrive en melding på 60–80 ord.\n\nDu har bestemt deg for å redusere skjermtiden din. Skriv en melding til en venn der du\n- forteller hvorfor du ønsker å gjøre det, og hvordan\n- forteller hva annet du vil bruke tiden din på framover, og hvorfor\n- inviterer vennen din til å være med på dette',
            image: null,
            modelAnswers: {
                simple: 'Hei! Jeg har bestemt meg for å bruke mindre tid på skjermen. Jeg ser for mye på telefonen. Det er ikke bra for søvnen min. Jeg vil legge vekk telefonen en time før jeg legger meg. Jeg vil bruke tiden min på å lese bøker. Jeg vil også gå turer og sykle mer. Vil du være med? Vi kan møtes og gjøre noe uten telefon. Hva tenker du?',
                rich: 'Hei! Jeg har bestemt meg for å redusere skjermtiden min, fordi jeg merker at jeg blir sliten og sover dårlig når jeg er for mye på mobilen. Derfor vil jeg legge vekk telefonen klokken åtte om kvelden, og jeg vil ikke sjekke den før jeg har stått opp neste morgen. Tiden vil jeg bruke på å lese, gå tur og spille et instrument igjen. Har du lyst til å være med på dette? Vi kan holde hverandre i gang. Si fra.',
            },
            attribution: 'Udir, Tysk II (FSP6242 / PSP5840 / FSP6246), eksamen høsten 2025',
        },
        {
            id: 'tysk2-exam-2025-eks-7',
            year: 2025,
            term: 'eksempel',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 7: Nærmiljøet mitt',
            prompt: 'I denne oppgaven skal du skrive en tekst på 170–200 ord om nærmiljøet ditt.\n\n- Hvordan ser nærmiljøet ditt ut? Ligger det i en by, på landet eller midt imellom?\n- Er det noe spesielt som gjør inntrykk på deg? Det kan for eksempel være noe du lukter, hører eller ser, eller det kan være en person du ofte møter.\n- Hvordan føler du deg når du går gjennom nærmiljøet ditt?\n- Hva ønsker du deg i nærmiljøet? Hvorfor?',
            image: null,
            modelAnswers: {
                simple: 'Jeg bor i en liten by i Norge. Byen ligger ved en fjord. Fjorden er stor og blå. Det er fjell rundt byen. Om sommeren er det grønt. Om vinteren er det hvitt og kaldt. Det bor omtrent ti tusen mennesker her. Jeg har gått på skole her hele livet. Det er mange ting jeg liker. Jeg lukter ofte sjø og bakeri. Det er en gammel mann som jeg møter hver morgen. Han heter Ole. Han har en liten hund. Han hilser alltid på meg. Jeg liker det lille bakeriet ved torget. Brødet lukter godt. Når jeg går gjennom byen, er jeg rolig og glad. Jeg kjenner mange folk. Jeg vet hvor alt er. Det gjør meg trygg. Jeg ønsker meg en ny park med lekeplass. Det bor mange barn her, men det finnes lite for dem å gjøre ute. Derfor bør kommunen bygge noe nytt for ungene.',
                rich: 'Nærmiljøet mitt er en liten kystby et sted mellom by og land. Jeg har vokst opp her, så alle gater og smug kjenner jeg ut og inn. Byen ligger klemt mellom høye fjell og en dyp fjord, og særlig om høsten ligger ofte tåka over vannet om morgenen — det er noe av det vakreste jeg vet. Lukten av salt, tang og nybakt brød fra bakeriet ved torget følger meg på veien til skolen. En person jeg ofte møter, er Ole, en eldre mann med en liten hund som alltid stopper for å slå av en prat. Slike små møter gjør at stedet kjennes trygt og levende. Når jeg går gjennom byen, blir jeg rolig og litt nostalgisk på samme tid. Jeg vet hvor alt er, og det er hyggelig — men det er også det samme som gjør at jeg av og til drømmer meg bort. Det jeg savner mest, er en større park med skikkelig lekeplass for barna i nabolaget, fordi mange unger mangler et trygt sted å samles på. Da hadde nærmiljøet blitt enda bedre.',
            },
            attribution: 'Udir, Tysk II (FSP6242 / PSP5840 / FSP6246), eksamen høsten 2025',
        },
        {
            id: 'tysk2-exam-2025-eks-6',
            year: 2025,
            term: 'eksempel',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 6: E-post til hotellet',
            prompt: 'I denne oppgaven skal du skrive en e-post på 120–150 ord.\n\nDu er på ferie med en vennegjeng. Dere er misfornøyde med hotellet dere bor på. Hotellet har ingen fysisk resepsjon, og hotellgjestene må skrive en e-post dersom de vil kontakte hotellet. Dere kom på mandag, og nå er det onsdag kveld. Nok er nok!\n\nBruk bildene, og skriv en e-post der du forklarer hva som har skjedd, og hva som ikke fungerer. Hva må hotellet gjøre for at dere skal bli fornøyde?\n\n(Bildene viser: et skittent hotellrom med søppel på gulvet; et stengt basseng; en dårlig frokost — bare brød og syltetøy.)',
            image: null,
            modelAnswers: {
                simple: 'Hei! Vi er en gjeng fra Norge som bor på hotellet deres. Vi kom på mandag. Nå er det onsdag, og vi er ikke fornøyde. Rommet vårt er ikke rent. Det er støv på gulvet og søppel under senga. Vannet i dusjen er kaldt. Vi har sagt fra, men ingenting skjer. Bassenget skulle være åpent. Det står stengt. Vi gledet oss til å bade. Det går ikke. Frokosten er svært dårlig. Vi får bare brød og syltetøy. Det er ingen kaffe og ingen frukt. På bildene ser dere hvordan det ser ut hos oss. Vi vil ha et rent rom, varmt vann, et åpent basseng og en ordentlig frokost. Hjelp oss snart, ellers reiser vi hjem. Hilsen gjestene på rom 312.',
                rich: 'Hei! Vi skriver til dere fordi vi er en vennegjeng fra Norge som har bodd på hotellet deres siden mandag, og oppholdet har ikke vært slik vi ventet. På bildene ser dere flere av problemene vi opplever hver dag. Først av alt: rommet vårt er svært skittent — det er støv på gulvet, søppel under senga og det varme vannet i dusjen slutter ofte å virke. Bassenget på prospektet er stengt uten forklaring, selv om vi valgte hotellet nettopp fordi vi ønsket å bade. Frokosten er også en skuffelse: bare brød og syltetøy, ingen kaffe og lite frukt eller protein. Vi har prøvd å si fra, men det finnes ingen resepsjon å gå til. Derfor skriver vi denne e-posten. Vi ber dere om et rent rom, varmt vann, et åpent basseng og en skikkelig frokost — i dag. Hilsen gjestene på rom 312.',
            },
            attribution: 'Udir, Tysk II (FSP6242 / PSP5840 / FSP6246), eksamen høsten 2025',
        },
    ],
};

/**
 * Backward-compatible alias. Older callers that imported `tasks` get the
 * writing corpus by default.
 */
export const tasks = writingTasks;

/**
 * Convenience: list of valid level + mode keys.
 */
export const LEVELS = ['tysk-1', 'tysk-2'];
export const MODES = ['writing', 'exam'];
