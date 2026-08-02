/**
 * Word bank for the Writing Spinner — Norwegian Nynorsk (nn).
 *
 * Categories:
 *   starters  — sentence starters grouped by genre and level (us/vgs)
 *   synonyms  — common overused words → better alternatives (common/us/vgs)
 *   stopwords — words to ignore in frequency analysis
 *
 * Levels:
 *   us  — Ungdomsskole (lower secondary, ages 13-16)
 *   vgs — Vidaregåande skule (upper secondary, ages 16-19)
 *
 * All data is static — no API calls, works offline.
 * The student decides whether the suggestion fits — that's the learning mechanism.
 */

// ─── SYNONYMS ──────────────────────────────────────────────────────────────────

export const synonyms = {
    // Both levels — everyday overused words
    common: {
        'meiner': ['hevdar', 'påstår', 'reknar med', 'held fram'],
        'seier': ['uttalar', 'hevdar', 'peikar på', 'framhevar', 'konstaterer'],
        'viser': ['illustrerer', 'avslører', 'demonstrerer', 'tydeleggjer'],
        'brukar': ['nyttar', 'tek i bruk', 'nyttiggjer seg'],
        'gjer': ['utfører', 'gjennomfører', 'bidreg til'],
        'får': ['oppnår', 'mottek', 'tileignar seg'],
        'har': ['sit med', 'rår over', 'disponerer'],
        'ser': ['observerer', 'legg merke til', 'registrerer'],
        'tenkjer': ['reflekterer', 'vurderer', 'funderer på'],
        'veit': ['kjenner til', 'er kjend med', 'forstår'],
        'stor': ['betydeleg', 'omfattande', 'vesentleg', 'markant'],
        'liten': ['beskjeden', 'ubetydeleg', 'marginal', 'minimal'],
        'god': ['effektiv', 'vellukka', 'gunstig', 'fordelaktig'],
        'dårleg': ['uheldig', 'problematisk', 'utilstrekkeleg', 'mangelfull'],
        'viktig': ['avgjerande', 'sentral', 'vesentleg', 'betydingsfull'],
        'mange': ['talrike', 'ei rekkje', 'adskillige', 'eit stort tal'],
        'mykje': ['i stor grad', 'monaleg', 'i vesentleg grad'],
        'ny': ['moderne', 'innovativ', 'nyskapande', 'fersk'],
        'også': ['i tillegg', 'dessutan', 'vidare', 'likeins'],
        'derfor': ['følgjeleg', 'av den grunn', 'dermed', 'difor'],
        'men': ['likevel', 'derimot', 'til trass for dette'],
        'fordi': ['ettersom', 'sidan', 'på grunn av at', 'då'],
        'veldig': ['svært', 'særs', 'i høg grad', 'ytterst'],
        'fin': ['framifrå', 'utmerka', 'glimrande'],
        'ting': ['aspekt', 'tilhøve', 'forhold', 'element'],
        'bra': ['tilfredsstillande', 'godt', 'positivt', 'heldig'],
        'heilt': ['fullstendig', 'gjennomgåande', 'totalt'],
        'eigentleg': ['i røynda', 'i grunnen', 'strengt teke'],
        'litt': ['noko', 'i nokon grad', 'til ein viss grad'],
        'alltid': ['gjennomgåande', 'konsekvent', 'uavlateleg'],
        'aldri': ['på ingen måte', 'ikkje under nokon omstende'],
        'kanskje': ['truleg', 'moglegvis', 'eventuelt'],
        'sjølvsagt': ['naturlegvis', 'openbert', 'utan tvil'],
        'sikkert': ['truleg', 'utan tvil', 'med visse'],
        'akkurat': ['nett', 'presist', 'nettopp'],
        'verkeleg': ['faktisk', 'i røynda', 'sanneleg'],
        'ganske': ['relativt', 'nokså', 'temmeleg'],
        'så': ['deretter', 'følgjeleg', 'såleis'],
        'tek': ['handsamar', 'behandlar', 'grip fatt i'],
        'kjem': ['dukkar opp', 'oppstår', 'innfinn seg'],
        'går': ['fungerer', 'verkar', 'føregår'],
    },

    // Ungdomsskole — simpler/narrative words students overuse
    us: {
        'kul': ['spennande', 'interessant', 'fascinerande'],
        'rar': ['uventa', 'overraskande', 'påfallande'],
        'lei seg': ['trist', 'sorgtung', 'nedstemt'],
        'glad': ['lukkeleg', 'nøgd', 'oppglødd', 'fornøgd'],
        'sint': ['rasande', 'irritert', 'opprørt', 'harm'],
        'redd': ['uroleg', 'engsteleg', 'ottesam'],
        'syns': ['opplever', 'meiner', 'har inntrykk av'],
        'skjønar': ['forstår', 'fattar', 'innser'],
        'liksom': ['på ein måte', 'så å seie', 'nærmast'],
        'typ': ['omtrent', 'noko i retning av', 'ein slags'],
        'dritkul': ['fantastisk', 'imponerande', 'eineståande'],
        'feit': ['morosam', 'underhaldande', 'morosom'],
        'ikkje noko': ['ingenting', 'ikkje ein einaste ting'],
        'masse': ['mykje', 'mange', 'ei rekkje', 'eit stort tal'],
        'skummel': ['skremmande', 'urovekkjande', 'uhyggeleg'],
        'sliten': ['utmatta', 'trøytt', 'utsliten'],
        'kjedeleg': ['einsformig', 'monoton', 'lite engasjerande'],
        'lett': ['enkel', 'ukomplisert', 'overkommeleg'],
        'vanskeleg': ['utfordrande', 'krevjande', 'komplisert'],
        'merkjeleg': ['påfallande', 'oppsiktsvekkjande', 'uventa'],
    },

    // VGS — academic register
    vgs: {
        'argumenterer for': ['grunngjev', 'forfektar', 'talar for'],
        'er einig': ['stiller seg bak', 'deler synet', 'sluttar seg til'],
        'peikar på': ['gjer greie for', 'framhevar', 'rettar merksemda mot'],
        'handlar om': ['omhandlar', 'tek føre seg', 'krinsar rundt'],
        'kjem av': ['skriv seg frå', 'har sitt opphav i', 'skuldast'],
        'fører til': ['resulterer i', 'medfører', 'inneber'],
        'er mot': ['opponerer mot', 'motset seg', 'avviser'],
        'passar': ['korresponderer med', 'samsvarar med', 'er i tråd med'],
        'ser på': ['undersøkjer', 'analyserer', 'granskar'],
        'tek opp': ['tematiserer', 'problematiserer', 'aktualiserer'],
        'legg vekt på': ['prioriterer', 'framhevar', 'vektlegg'],
        'set spørsmålsteikn ved': ['problematiserer', 'utfordrar', 'dreg i tvil'],
        'er samd': ['konvergerer', 'finn samsvar', 'er kongruent med'],
        'byggjer på': ['tek utgangspunkt i', 'funderer på', 'baserer seg på'],
        'gjev uttrykk for': ['manifesterer', 'vitnar om', 'signaliserer'],
        'er med på': ['bidreg til', 'understøttar', 'fremjar'],
        'heng saman med': ['korrelerer med', 'står i samband med', 'er knytt til'],
        'kan ikkje': ['er ute av stand til', 'manglar føresetnader for'],
        'trur': ['antar', 'held for truleg', 'postulerer'],
        'betyr': ['inneber', 'impliserer', 'tyder'],
        'påverkar': ['influerer', 'øver innverknad på', 'pregar'],
        'skildrar': ['framstiller', 'portretterer', 'teiknar eit bilete av'],
        'avdekkjer': ['blottlegg', 'eksponerer', 'synleggjer'],
        'fremjar': ['katalyserer', 'stimulerer', 'driv fram'],
        'avgrensar': ['demarkerer', 'presiserer', 'innsnevrar'],
        'kontrasterer': ['stiller opp mot', 'set i relieff', 'motset'],
        'legitimerer': ['rettferdiggjer', 'grunngjev', 'heimlar'],
        'manifesterer': ['kjem til uttrykk i', 'materialiserer seg som'],
        'kontekstualiserer': ['plasserer i ein samanheng', 'situerer'],
        'nyanserer': ['modererer', 'differensierer', 'raffinerer'],
    },
};

// ─── STARTERS ───────────────────────────────────────────────────────────────────

export const starters = {
    analyse: {
        us: {
            innleiing: [
                'I denne teksten skal eg analysere...',
                'Teksten eg skal sjå nærare på er...',
                'Temaet i denne teksten handlar om...',
                'Forfattaren skriv om...',
                'Eg har valt å analysere denne teksten fordi...',
                'Denne teksten vart skriven av... og handlar om...',
            ],
            hovuddel: [
                'Forfattaren brukar verkemiddelet... for å vise...',
                'Eit døme på dette finn vi i...',
                'Her ser vi at forfattaren...',
                'Effekten av dette verkemiddelet er at...',
                'Språket i teksten er prega av...',
                'Vi kan merke oss at forfattaren vel å...',
                'Dette valet er ikkje tilfeldig, det viser...',
            ],
            avslutning: [
                'Alt i alt viser analysen at...',
                'Hovudbodskapen i teksten er...',
                'Verkemidla bidreg samla sett til å...',
                'For å oppsummere er denne teksten eit døme på...',
                'Etter analysen min meiner eg at forfattaren...',
                'Teksten lukkast med å formidle... fordi...',
            ],
        },
        vgs: {
            innleiing: [
                'Denne analysen tek føre seg... med utgangspunkt i...',
                'I det følgjande skal eg gjere greie for dei sentrale verkemidla i...',
                'Teksten aktualiserer spørsmålet om... gjennom...',
                'Med utgangspunkt i retorisk analyse vil eg undersøkje korleis...',
                'Teksten kan lesast i lys av... og eg vil argumentere for at...',
                'Eit sentralt trekk ved denne teksten er korleis forfattaren...',
            ],
            hovuddel: [
                'Forfattaren etablerer ethos gjennom...',
                'Det retoriske grepet fungerer her som...',
                'Intertekstualiteten i teksten kjem til uttrykk ved...',
                'Den underliggjande premissen i argumentasjonen er...',
                'Samanstillinga av... og... skapar ein kontrast som...',
                'Tekstens komposisjon underbyggjer bodskapen ved at...',
                'Det ideologiske bakteppet gjer seg gjeldande gjennom...',
                'Forfattarens val av synsvinkel impliserer...',
            ],
            avslutning: [
                'Analysen avdekkjer eit mønster der...',
                'Dei retoriske strategiane konvergerer i...',
                'Samla sett demonstrerer teksten korleis...',
                'Analysen har vist at teksten opererer på fleire nivå...',
                'Konklusjonen vert at forfattaren med dette...',
                'Teksten representerer såleis eit døme på korleis...',
            ],
        },
    },

    droefting: {
        us: {
            innleiing: [
                'I denne teksten skal eg drøfte...',
                'Det er mange ulike meiningar om...',
                'Spørsmålet om... er noko mange er ueinige om.',
                'Er det rett at...? I denne teksten skal eg sjå på ulike sider.',
                'Temaet eg skal drøfte er aktuelt fordi...',
                'Mange meiner ulikt om..., og eg skal sjå på argumenta.',
            ],
            argument: [
                'Eit viktig argument for dette er...',
                'Dei som er for dette meiner at...',
                'Det finst gode grunnar til å meina at...',
                'For det første kan ein seie at...',
                'I tillegg er det viktig å hugse at...',
                'Eit anna argument er at...',
                'Forsking viser at...',
            ],
            motargument: [
                'På den andre sida...',
                'Dei som er mot dette seier at...',
                'Eit motargument er at...',
                'Likevel kan ein innvende at...',
                'Det er ikkje alle som er samde, fordi...',
                'Mot dette kan ein hevde at...',
            ],
            eksempel: [
                'Eit godt døme på dette er...',
                'Vi ser dette tydeleg i...',
                'Ein konkret konsekvens er...',
                'I praksis tyder dette at...',
                'Eit døme frå kvardagen er...',
                'Dette kan illustrerast med...',
            ],
            overgang: [
                'I tillegg til dette...',
                'Eit anna viktig poeng er...',
                'Dessutan...',
                'Når det gjeld...',
                'Vi må også sjå på...',
                'Med dette som bakgrunn...',
                'La oss no sjå på...',
            ],
            kilde: [
                'Ifølgje... er det slik at...',
                'Som... peikar på...',
                'I artikkelen "..." vert det hevda at...',
                'Tal frå... viser at...',
                'Ei undersøking viser at...',
                'Eksperten... meiner at...',
            ],
            avslutning: [
                'Alt i alt meiner eg at...',
                'Etter å ha sett på begge sider meiner eg at...',
                'Sjølv om det finst gode argument på begge sider...',
                'Konklusjonen min er at...',
                'Eg landar på at... fordi...',
                'Samla sett er det mest som talar for at...',
            ],
        },
        vgs: {
            innleiing: [
                'Problemstillinga reiser grunnleggjande spørsmål om...',
                'I denne drøftinga vil eg ta utgangspunkt i spenninga mellom...',
                'Spørsmålet om... rører ved sentrale verdikonfliktar i...',
                'Denne drøftinga vil belyse korleis... kan forståast frå ulike perspektiv.',
                'Den aktuelle debatten om... aktualiserer spørsmålet om...',
                'Eit sentralt dilemma i denne samanhengen er korleis...',
            ],
            argument: [
                'Frå eit... perspektiv kan ein argumentere for at...',
                'Denne posisjonen finn støtte i... som peikar på at...',
                'Den underliggjande premissen er at...',
                'Argumentet vert forsterka av det faktum at...',
                'Dersom vi legg til grunn at..., følgjer det at...',
                'Eit empirisk grunnlag for dette finn vi i...',
                'Den logiske konsekvensen av dette resonnementet er...',
            ],
            motargument: [
                'Eit sentralt motargument tek utgangspunkt i...',
                'Frå ein... ståstad kan ein likevel innvende at...',
                'Denne posisjonen er ikkje utan problem, ettersom...',
                'Kritikarar peikar på det paradoksale i at...',
                'Ei mogleg innvending er at premissen om... ikkje held.',
                'Nyanserer vi dette perspektivet, ser vi at...',
            ],
            eksempel: [
                'Dette kan illustrerast med...',
                'Eit talande døme er...',
                'Problemstillinga manifesterer seg konkret i...',
                'Konsekvensane vart tydelege då...',
                'Erfaringane frå... tilseier at...',
                'Parallellen til... er slåande...',
            ],
            overgang: [
                'Vidare er det verdt å merke seg at...',
                'Eit anna viktig aspekt er...',
                'Ikkje berre... men også...',
                'Drøftinga har så langt vist at...',
                'La meg no vende blikket mot...',
                'Eit nærskyldt spørsmål er...',
                'Med dette som bakteppe...',
            ],
            kilde: [
                'Ifølgje... er det slik at...',
                'Som... peikar på...',
                'I artikkelen "..." vert det hevda at...',
                'Statistikk frå... viser at...',
                'I boka si "..." argumenterer... for at...',
                'Forskinga til... dokumenterer at...',
                'Studien konkluderer med at...',
            ],
            avslutning: [
                'Drøftinga har vist at spørsmålet ikkje let seg redusere til...',
                'Spenninga mellom... og... peikar mot eit behov for...',
                'Ei mogleg syntese kan vere at...',
                'Konklusjonen vert at... under føresetnad av at...',
                'Avveginga mellom... og... tilseier at...',
                'Sjølv om det ikkje finst eit eintydig svar, meiner eg at...',
            ],
        },
    },

    fagartikkel: {
        us: {
            innleiing: [
                'I denne fagartikkelen skal eg forklare...',
                'Temaet eg skal skrive om er...',
                'Visste du at...? I denne teksten skal eg fortelje meir om...',
                'Mange lurer på kva... eigentleg er. Her skal eg forklare det.',
                'Eg har valt å skrive om... fordi...',
                'For å forstå... må vi først sjå på...',
            ],
            hovuddel: [
                'For det første er det viktig å vite at...',
                'Ein sentral del av dette er...',
                'Forsking viser at...',
                'I praksis betyr dette at...',
                'Eit godt døme på dette er...',
                'Det finst fleire årsaker til at...',
                'Ei vanleg misforståing er at..., men eigentleg...',
                'Ifølgje... er det slik at...',
            ],
            avslutning: [
                'For å oppsummere kan ein seie at...',
                'Det viktigaste å ta med seg er at...',
                'Som vi har sett, er... eit tema som...',
                'Framover vil truleg... bli endå viktigare fordi...',
                'Artikkelen har vist at...',
                'Konklusjonen er at...',
            ],
        },
        vgs: {
            innleiing: [
                'Denne fagartikkelen undersøkjer... med utgangspunkt i...',
                'Føremålet med denne artikkelen er å gjere greie for...',
                'I skjeringspunktet mellom... og... finn vi...',
                'Ei grunnleggjande forståing av... føreset kjennskap til...',
                'Feltet... har gjennomgått store endringar dei siste åra.',
                'Den vitskaplege forståinga av... har utvikla seg frå... til...',
            ],
            hovuddel: [
                'Fagfeltet skil mellom... og..., der...',
                'Forskingsgrunnlaget indikerer at...',
                'Ein sentral mekanisme i denne samanhengen er...',
                'Fenomenet kan forklarast ut frå... som inneber...',
                'Datagrunnlaget viser ein korrelasjon mellom... og...',
                'Det er føremålstenleg å skilje mellom... og...',
                'Ei nærare gransking av dette avdekkjer...',
                'Den teoretiske ramma gjev grunnlag for å hevde at...',
            ],
            avslutning: [
                'Artikkelen har gjort greie for korleis...',
                'Kunnskapsstatusen tilseier at...',
                'Implikasjonane av dette er at...',
                'Vidare forsking bør undersøkje...',
                'Samla sett gjev dette grunnlag for å konkludere med at...',
                'Dei sentrale funna kan oppsummerast som...',
            ],
        },
    },

    kronikk: {
        us: {
            innleiing: [
                'Tenk deg at... Det er røyndomen for mange i dag.',
                'I den siste tida har debatten om... vakse.',
                'Kvifor er det slik at...? Det vil eg sjå nærare på her.',
                'Det er på tide at vi snakkar om...',
                'Mange unge opplever at..., og det er eit problem.',
                'Samfunnet vårt står overfor eit val når det gjeld...',
            ],
            hovuddel: [
                'Problemet er at...',
                'Det som gjer saka endå meir alvorleg er...',
                'Mitt eige møte med dette viser at...',
                'Når vi ser på tala, er biletet klart:...',
                'Politikarar snakkar mykje om..., men gjer lite.',
                'Ei mogleg løysing er at...',
                'Vi kan ikkje lenger late att...',
            ],
            avslutning: [
                'Det er på tide at nokon tek ansvar for...',
                'Vi skuldar dei unge å...',
                'Viss vi ikkje handlar no, vil konsekvensen bli...',
                'Eg oppfordrar alle til å...',
                'Spørsmålet er ikkje om vi har råd til å gjere noko, men om vi har råd til å la vere.',
                'La oss starte med å...',
            ],
        },
        vgs: {
            innleiing: [
                'I kjølvatnet av... har debatten om... fått ny relevans.',
                'Dei siste åras utvikling har tvinga fram eit oppgjer med...',
                'Under overflata av den offentlege debatten om... ligg...',
                'Det er ein grunnleggjande motsetnad mellom... og...',
                'Medan politikarane diskuterer..., skjer det ei utvikling som...',
                'Paradokset i den norske... debatten er at...',
            ],
            hovuddel: [
                'Den strukturelle årsaka til dette ligg i...',
                'Problemet vert forsterka av at...',
                'Erfaringa mi som... har gjeve meg innsikt i...',
                'Retorikken tildekkjer det eigentlege problemet, som er...',
                'Konsekvensane av denne utviklinga manifesterer seg som...',
                'Ei naudsynt — men ikkje tilstrekkeleg — løysing er...',
                'Det krevst eit paradigmeskifte i korleis vi...',
                'Ansvaret må plasserast hos... som har makt til å...',
            ],
            avslutning: [
                'Dei som sit med avgjerdsmakt må innsjå at...',
                'Utan eit systemisk perspektiv vil vi halde fram med å...',
                'Framtida krev at vi konfronterer... heller enn å...',
                'Vi treng ei grunnleggjande omvurdering av...',
                'Alternativet — å gjere ingenting — er ikkje lenger eit val.',
                'Det handlar ikkje berre om..., men om kva slags samfunn vi ønskjer.',
            ],
        },
    },

    kaaseri: {
        us: {
            innleiing: [
                'Har du nokon gong tenkt over kvifor...?',
                'Det finst ting i livet som ingen førebudde oss på. Til dømes...',
                'Eg trur alle kjenner denne kjensla:...',
                'La meg fortelje om den gongen...',
                'Det er noko eg har lurt på lenge:...',
                'Viss det er éin ting som irriterer meg, så er det...',
            ],
            hovuddel: [
                'Det morsame er at...',
                'Og det stoppar ikkje der...',
                'No skal eg innrømme noko:...',
                'Du kjenner sikkert til...',
                'Det verste er at vi alle veit at..., men likevel...',
                'Eg veit ikkje med deg, men eg...',
                'Ironien er jo at...',
            ],
            avslutning: [
                'Så kva har vi lært av dette? Truleg ingenting.',
                'Men kanskje det er nettopp det som er poenget.',
                'Og neste gong nokon spør meg om..., skal eg svare...',
                'Til sjuande og sist handlar det jo om...',
                'Eg gjev meg her, men berre for no.',
                'Moralen? Det finst ingen. Berre...',
            ],
        },
        vgs: {
            innleiing: [
                'Det er fascinerande korleis... aldri sluttar å overraske.',
                'Vi lever i ei tid der... samstundes som... — og ingen reagerer.',
                'Lat meg ta dykk med inn i ein verden der...',
                'Det er noko djupt menneskeleg i måten vi...',
                'Fenomenet... har nådd nye, absurde høgder.',
                'Eg sat og tenkte — noko ein ikkje bør gjere for ofte — då det slo meg:...',
            ],
            hovuddel: [
                'Det paradoksale er jo at...',
                'Men her kjem vendinga:...',
                'Ein observant lesar vil kanskje innvende at... Og til det seier eg:...',
                'Det er som... sa: "..." — og det gjeld framleis.',
                'Vi har kollektivt bestemt oss for at... er greitt, og det er fascinerande.',
                'Ironien — og den er tjukk — er at...',
                'Om vi spoler tilbake... ser vi det same mønsteret:...',
                'Sjølvmotseiinga er openberr for alle andre enn dei det gjeld.',
            ],
            avslutning: [
                'Og slik held det fram, utan at nokon grip inn.',
                'Kanskje poenget ikkje er å finne svaret, men å stille spørsmålet høgt nok.',
                'Men kva veit vel eg — eg som...',
                'La oss einast om at... er absurd, og så gå vidare.',
                'Til dei som les dette og tenkjer "det gjeld ikkje meg": Det gjer det.',
                'Det er verd å tenkje over — men ikkje for lenge.',
            ],
        },
    },

    leserinnlegg: {
        us: {
            innleiing: [
                'Eg reagerer på... som eg las om i...',
                'Som elev ved... vil eg seie noko om...',
                'Det er ikkje rett at..., og det vil eg forklare.',
                'Eg skriv dette fordi eg er lei av at...',
                'I den siste tida har det vore mykje snakk om...',
                'Eg er usamd med dei som meiner at...',
            ],
            hovuddel: [
                'Hovudgrunnen til at eg meiner dette er...',
                'Eit døme frå min eigen kvardag er...',
                'Det mange ikkje tenkjer over er at...',
                'Konsekvensen av dette er at...',
                'Mitt forslag er at...',
                'Viss vi verkeleg meiner at..., må vi også...',
                'Det finst betre løysingar, til dømes...',
            ],
            avslutning: [
                'Eg håpar at dei som bestemmer vil...',
                'Det er på tide at nokon lyttar til...',
                'Vi fortener betre enn...',
                'Difor oppfordrar eg alle til å...',
                'La oss gjere noko med dette — no.',
                'Spørsmålet er: Kor lenge skal vi finne oss i dette?',
            ],
        },
        vgs: {
            innleiing: [
                'I eit innlegg publisert... hevdar... at... Dette er ei problematisk framstilling.',
                'Debatten om... avdekkjer eit grunnleggjande misforhold mellom...',
                'Som... med erfaring frå... vil eg utfordre påstanden om at...',
                'Det rådande narrativet om... fortener ei kritisk gransking.',
                'Når... hevdar at..., overser dei det faktum at...',
                'Det er påfallande korleis debatten om... konsekvent ignorerer...',
            ],
            hovuddel: [
                'Påstanden kviler på den tvilsame premissen at...',
                'Eit meir nyansert bilete framkjem dersom vi...',
                'Den empiriske evidensen peikar i ei anna retning:...',
                'Det er grunn til å stille spørsmål ved... ettersom...',
                'Ei konkret løysing som tek omsyn til... er...',
                'Ansvaret ligg ikkje hos..., men hos dei som...',
                'Konsekvensane av denne politikken rammar særleg...',
                'Dersom vi tek... på alvor, inneber det at...',
            ],
            avslutning: [
                'Det er på høg tid at debatten flyttar seg frå... til...',
                'Utan ei grunnleggjande endring i... vil vi halde fram med...',
                'Løysinga krev politisk vilje til å...',
                'Dei ansvarlege skuldar oss eit svar på...',
                'La dette innlegget vere ei påminning om at...',
                'Spørsmålet bør ikkje vere om, men korleis vi...',
            ],
        },
    },

    novelle: {
        us: {
            opning: [
                'Det var den dagen alt endra seg.',
                'Eg hadde aldri trudd at...',
                'Klokka var... då...',
                'Alt starta med...',
                'Det første eg la merke til var...',
                'Viss eg hadde visst kva som skulle skje, hadde eg...',
            ],
            handling: [
                'Plutseleg...',
                'Utan å tenkje...',
                'Det var då eg forstod at...',
                'Noko kjendest annleis...',
                'Eg visste at eg måtte...',
                'Det gjekk eit sekund, så...',
                'Hjarta dunka hardare då...',
            ],
            avslutning: [
                'Eg forstod endeleg at...',
                'Etter det vart ingenting heilt det same.',
                'Og slik enda det — ikkje med eit brak, men med...',
                'Kanskje det var det eg trengte heile tida.',
                'Eg gjekk derifrå og visste at...',
                'No var det berre éin ting igjen å gjere.',
            ],
        },
        vgs: {
            opning: [
                'Lyset fall inn gjennom vindauget og teikna mønster av...',
                'Det fanst ein versjon av meg som aldri...',
                'Stilla mellom oss var ikkje tom — ho var fylt av...',
                'Minnet kom tilbake som... — uventa og...',
                'Byen låg under oss som eit kart ingen kunne lese.',
                'Det var noko ved... som minte om noko eg hadde gløymt.',
            ],
            handling: [
                'Orda hang i lufta mellom dei som...',
                'Ho vende seg vekk, og i den rørsla låg...',
                'Kontrasten mellom... og... var...',
                'Tida syntest å stanse, som om verda venta på...',
                'Det var i det augeblikket skiljet mellom... og... vart tydeleg.',
                'Landskapet skifta karakter, som eit spegelbilde av...',
                'Kvar rørsle var medviten — som om...',
                'Det usagde vog tyngre enn det som vart sagt.',
            ],
            avslutning: [
                'Og kanskje var det nett det som var poenget — at...',
                'Grensa mellom... og... var ikkje lenger tydeleg.',
                'Det som stod att var berre... og ei kjensle av...',
                'Slik endar ikkje historier — dei berre...',
                'Framtida opna seg som... — ubestemt, men...',
                'I det stille visste eg at dette augeblikket ville...',
            ],
        },
    },


    // ─────────────────────────────────────────────────────────────────────────
    // KORTSVAR — kort, samanliknande oppgåve
    // ─────────────────────────────────────────────────────────────────────────
    kortsvar: {
        us: {
            innledning: [
                'Tekst 1 er skriven av... og handlar om...',
                'Eg skal samanlikne... og...',
                'I dette kortsvaret vil eg ta for meg...',
                'Begge tekstane tek opp temaet...',
            ],
            sammenligning: [
                'Begge tekstane peikar på at...',
                'Eit fellestrekk ved tekstane er...',
                'Den største likskapen er korleis dei...',
                'Både forfattar 1 og forfattar 2 legg vekt på...',
            ],
            forskjeller: [
                'På den andre sida vel tekst 2 å...',
                'Ein viktig forskjell er at...',
                'Mens tekst 1 er..., er tekst 2...',
                'Til forskjell frå tekst 1, brukar tekst 2...',
            ],
            oppsummering: [
                'Kort oppsummert viser samanlikninga at...',
                'Samla sett gir dei to tekstane eit bilete av...',
                'Hovudforskjellen koker ned til...',
                'Trass i ulikskapane er bodskapen...',
            ],
        },
        vgs: {
            innledning: [
                'Dette kortsvaret tek utgangspunkt i tekstane...',
                'Eg skal foreta ei samanlikning av...',
                'Begge tekstane rettar søkjelyset mot...',
                'Formålet med denne samanlikninga er...',
            ],
            sammenligning: [
                'Tematisk sett har tekstane mykje til felles, spesielt...',
                'Eit gjennomgåande likskapstrekk er bruken forfattarane gjer av...',
                'Parallellen mellom tekstane blir tydeleg når...',
                'Begge tekstane byggjer på premisset om at...',
            ],
            forskjeller: [
                'Forskjellen i verkemiddelbruk kjem fram ved at...',
                'Mens tekst 1 appellerer til..., støttar tekst 2 seg på...',
                'Kontrasten er markant i måten forfattarane...',
                'Der tekst 1 inntar eit... perspektiv, vel tekst 2...',
            ],
            oppsummering: [
                'Samanlikninga avdekkjer at tekstane utfyller...',
                'Konklusjonen er at tekstane belyser temaet frå...',
                'Dette viser korleis ulik form påverkar...',
                'Samla sett underbyggjer dei begge at...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // KREATIV TEKST — forteljing, dikt, novelle (kreativ inngang)
    // ─────────────────────────────────────────────────────────────────────────
    'kreativ-tekst': {
        us: {
            aapning: [
                'Det heile byrja den dagen då...',
                'Utan forvarsel small det...',
                'Sola steikte, og gatene var tomme...',
                'Ingen hadde trudd at...',
            ],
            skildring: [
                'Lufta var tung av...',
                'Lyden av... fylte rommet...',
                'Skuggane dansa over...',
                'Ei iskald kjensle spreidde seg...',
            ],
            vendepunkt: [
                'Men plutseleg forandra alt seg...',
                'Det var då ho forstod at...',
                'I det augneblinken skjedde det utrulege...',
                'Ting skulle aldri bli det same igjen...',
            ],
            avslutning: [
                'Og med det var kapittelet lukka.',
                'Kanskje var det like greitt.',
                'Stilla senka seg endeleg.',
                'Nokre gonger er det beste å...',
            ],
        },
        vgs: {
            aapning: [
                'Regnet slo nådelaust mot asfalten, mens...',
                'Stilla i rommet var nesten til å ta og føle på...',
                'I eit flyktig sekund trudde ho at...',
                'Det låg ei ubeskriveleg tyngd over...',
            ],
            skildring: [
                'Lyset braut gjennom støvskya og...',
                'Lukta av... vekte umiddelbart minne om...',
                'Landskapet låg bada i...',
                'Andletet hans bar preg av...',
            ],
            vendepunkt: [
                'Det uunngåelege inntrefte med brutal kraft...',
                'Som eit lyn frå klar himmel innsåg han at...',
                'Det var denne augneblinken som definerte alt...',
                'Erkjenninga trefte henne som eit slag...',
            ],
            avslutning: [
                'Slik vart det verande, urørleg og stille.',
                'Minne bleikna i lyset av ein ny dag.',
                'Og ingenting ville nokosinne bli det same.',
                'Til sjuande og sist var alt berre...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // REFLEKTERENDE TEKST
    // ─────────────────────────────────────────────────────────────────────────
    'reflekterende-tekst': {
        us: {
            innledning: [
                'Har du nokon gong tenkt over kvifor...',
                'Dette temaet får meg til å tenkje på...',
                'I dag snakkar alle om..., men...',
                'Eit spørsmål som ofte dukkar opp er...',
            ],
            hoveddel: [
                'På den eine sida kan ein seie at...',
                'Samtidig er det viktig å hugse på...',
                'Dette kan hengje saman med...',
                'Mine eigne erfaringar viser at...',
            ],
            refleksjon: [
                'Eg trur at grunnen til dette er...',
                'Det får meg til å innsjå at...',
                'Kanskje ligg løysinga i å...',
                'Dette minner meg om...',
            ],
            avslutning: [
                'Alt i alt er dette eit tema som krev...',
                'Forhåpentlegvis vil vi ein dag...',
                'Det viktigaste eg tek med meg er...',
                'Kanskje har vi noko å lære av...',
            ],
        },
        vgs: {
            innledning: [
                'Ei av dei store utfordringane i vår tid er knytt til...',
                'Å reflektere over... tvingar oss til å...',
                'Debatten om... reiser grunnleggjande spørsmål om...',
                'Det finst knapt eit eintydig svar på kvifor...',
            ],
            hoveddel: [
                'Eit sentralt aspekt ved denne problematikken er...',
                'Det er nærliggjande å trekkje parallellar til...',
                'Dette fenomenet må sjåast i samanheng med...',
                'I eit breiare perspektiv kan ein hevde at...',
            ],
            refleksjon: [
                'Dette etterlèt ei kjensle av ambivalens...',
                'Erkjenninga av at... opnar for nye spørsmål...',
                'Djupt sett handlar dette om vår evne til...',
                'Kanskje ligg kjernen i problemet nettopp i...',
            ],
            avslutning: [
                'Slik sett representerer... ikkje berre ei utfordring, men...',
                'Avslutningsvis er det grunn til å minne om...',
                'Til sjuande og sist koker det ned til...',
                'Refleksjonen leier oss fram til at...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // RETORISK ANALYSE
    // ─────────────────────────────────────────────────────────────────────────
    'retorisk-analyse': {
        us: {
            innledning: [
                'Teksten eg skal analysere heiter...',
                'Formålet med teksten er å overtyde om at...',
                'Avsendaren av teksten er...',
                'Målgruppa ser ut til å vere...',
            ],
            'retorisk-situasjon': [
                'Teksten vart skriven fordi...',
                'Den retoriske situasjonen er prega av...',
                'Situasjonen kravde at avsendaren...',
                'Debatten rundt dette temaet var...',
            ],
            etos: [
                'Forfattaren byggjer tillit ved å...',
                'Avsendaren framstår som truverdig fordi...',
                'Bruken av eigne erfaringar styrkjer etos...',
                'Etos vert etablert tidleg i teksten ved...',
            ],
            patos: [
                'Teksten spelar på kjensler som...',
                'Forfattaren prøver å vekkje lesaren si...',
                'Bruken av sterke ord skaper ei kjensle av...',
                'For å fange merksemda brukar avsendaren...',
            ],
            logos: [
                'Forfattaren brukar fakta for å bevise at...',
                'Logikken i teksten er bygd opp rundt...',
                'Argumenta vert støtta av statistikk som viser...',
                'Avsendaren argumenterer logisk ved å vise til...',
            ],
            virkemidler: [
                'Eit viktig verkemiddel her er...',
                'Gjentakinga av... understrekar at...',
                'Forfattaren brukar ironi for å vise at...',
                'Metaforen... hjelper lesaren å forstå...',
            ],
            avslutning: [
                'Alt i alt lykkast teksten med å...',
                'Den mest effektive appellforma er...',
                'Konklusjonen er at forfattaren klarer å...',
                'Trass i sterke argument, manglar teksten...',
            ],
        },
        vgs: {
            innledning: [
                'Denne retoriske analysen tek for seg...',
                'Hovudintensjonen til avsendaren er å...',
                'Teksten posisjonerer seg i debatten om...',
                'Den retoriske strategien kviler tungt på...',
            ],
            'retorisk-situasjon': [
                'Det påtrengjande problemet (exigence) er...',
                'Kairos-augneblinken for teksten er prega av...',
                'Avsendaren tilpassar seg den retoriske situasjonen ved...',
                'Konteksten teksten inngår i, krev ein strategi som...',
            ],
            etos: [
                'Avsendaren konstruerer ein initial etos prega av...',
                'Den avleidde etosen vert styrkt undervegs ved at...',
                'Kompetanse og autoritet vert etablert gjennom...',
                'Etos appellerer til målgruppa sine verdiar (dyd) ved å...',
            ],
            patos: [
                'Patosappellen vert aktivert umiddelbart gjennom...',
                'Det kjenslemessige engasjementet vert vekt ved hjelp av...',
                'Biletbruken bidreg sterkt til å mobilisere patos...',
                'Skiftet i tonefall skaper ein emosjonell kontrast som...',
            ],
            logos: [
                'Den logiske argumentasjonen (logos) vert boren fram av...',
                'Premissar og entymem vert nytta for å...',
                'Induktiv resonnering ligg til grunn for påstanden om...',
                'Haldbarheita i argumentasjonen vert styrkt av...',
            ],
            virkemidler: [
                'Det stilistiske valet av... fungerer overtydande...',
                'Dei retoriske spørsmåla tener funksjonen å...',
                'Kontrastbruken polariserer debatten ved å...',
                'Den gjennomgåande metaforikken forsterkar inntrykket av...',
            ],
            avslutning: [
                'Samla sett framstår den retoriske strategien som...',
                'Den dominerande patosappellen overskuggar imidlertid...',
                'Avsendaren oppnår sitt perlokutive mål ved å...',
                'Teksten sin retoriske styrke ligg i samspelet mellom...',
            ],
        },
    },

    generell: {
        us: {
            innleiing: [
                'I denne teksten skal eg skrive om...',
                'Eg har valt dette temaet fordi...',
                'Det er viktig å vite noko om... fordi...',
                'Mange har meiningar om..., men kva er eigentleg sant?',
                'La meg starte med å forklare kva... betyr.',
                'Temaet eg skal ta for meg er...',
            ],
            overgang: [
                'I tillegg til dette...',
                'Vidare er det verdt å sjå på...',
                'Eit anna poeng er...',
                'Dessutan...',
                'Vi kan også leggje merke til at...',
                'Når det gjeld...',
                'Med dette som bakgrunn...',
                'La oss no sjå nærare på...',
            ],
            avslutning: [
                'For å oppsummere...',
                'Alt i alt...',
                'Det viktigaste eg har funne ut er...',
                'Konklusjonen min er...',
                'Til slutt vil eg seie at...',
                'Etter å ha sett på dette meiner eg at...',
            ],
        },
        vgs: {
            innleiing: [
                'Eit sentralt perspektiv i denne samanhengen er...',
                'Problemstillinga kan formulerast som...',
                'I det følgjande vil eg gjere greie for...',
                'Utgangspunktet for denne teksten er...',
                'Det er føremålstenleg å starte med å avklare...',
                'Kompleksiteten i dette feltet gjer det naudsynt å...',
            ],
            overgang: [
                'I forlenginga av dette...',
                'Eit komplementært perspektiv er...',
                'Parallelt med dette ser vi at...',
                'Dersom vi utvider perspektivet...',
                'Ein logisk implikasjon av dette er...',
                'Medan... er det samstundes slik at...',
                'I kontrast til dette...',
                'Ei vidare nyansering avdekkjer at...',
            ],
            avslutning: [
                'Drøftinga har vist at spørsmålet er meir samansett enn...',
                'Dei sentrale funna kan oppsummerast som...',
                'Ei mogleg syntese av dei ulike perspektiva er...',
                'Analysen peikar i retning av at...',
                'Konklusjonen er førebels, men det er grunnlag for å hevde...',
                'Vidare refleksjon over dette bør ta omsyn til...',
            ],
        },
    },
};

// ─── STOPWORDS ──────────────────────────────────────────────────────────────────

/**
 * Nynorsk stop words — excluded from frequency analysis.
 * Common function words that appear often but carry no content meaning.
 */
export const stopwords = new Set([
    // Artiklar/determinativar
    'ein', 'ei', 'eit', 'den', 'det', 'dei',
    // Pronomen
    'eg', 'du', 'han', 'ho', 'vi', 'dykk', 'dei', 'seg', 'sin', 'sitt', 'sine',
    'meg', 'deg', 'oss', 'denne', 'dette', 'desse', 'min', 'mitt', 'mine', 'din', 'ditt', 'dine',
    'vår', 'vårt', 'våre', 'hans', 'hennar', 'deira',
    // Preposisjonar
    'i', 'på', 'til', 'for', 'med', 'av', 'om', 'frå', 'ved', 'over', 'under',
    'etter', 'mellom', 'mot', 'gjennom', 'blant', 'hos', 'utan', 'innan',
    // Konjunksjonar
    'og', 'eller', 'men', 'for', 'so', 'at', 'då', 'når', 'dersom', 'fordi',
    'sidan', 'sjølv', 'om', 'enn', 'som', 'der', 'her', 'kvar',
    // Hjelpeverb
    'er', 'var', 'har', 'hadde', 'vil', 'ville', 'skal', 'skulle', 'kan', 'kunne',
    'må', 'måtte', 'bør', 'burde', 'vert', 'vart', 'vorte', 'vore', 'vere',
    'ha', 'få', 'fekk', 'fått', 'bli', 'verta',
    // Andre vanlege
    'ikkje', 'ingen', 'noko', 'nokon', 'alt', 'alle', 'mange', 'meir', 'mest',
    'kva', 'kven', 'korleis', 'kvifor', 'kvar',
    'også', 'berre', 'heilt', 'slik', 'veldig', 'ganske', 'særs',
    'jo', 'ja', 'nei', 'no', 'då', 'her', 'der', 'dit',
    'nett', 'endå', 'likevel', 'difor', 'dessutan', 'altså',
]);

// ─── STEMMER ────────────────────────────────────────────────────────────────────

/**
 * Simple Nynorsk stemmer — strips common suffixes to group word forms.
 * Not linguistically perfect, but good enough for frequency grouping.
 * @param {string} word - Lowercase word
 * @returns {string} Stemmed form
 */
export function stem(word) {
    if (word.length < 4) return word;

    // Strip common Nynorsk endings, longest first
    const suffixes = [
        'ingar', 'ande', 'inga', 'heit', 'skap',
        'ane', 'ene', 'ert', 'ing', 'leg', 'isk', 'ast', 'ast',
        'ar', 'en', 'et', 'te', 'de', 'er', 'ne', 'st',
        'a', 'e', 's',
    ];
    for (const suf of suffixes) {
        if (word.length > suf.length + 2 && word.endsWith(suf)) {
            return word.slice(0, -suf.length);
        }
    }
    return word;
}
