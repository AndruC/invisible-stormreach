/* Shared data: places, nights, street voices, visions.
   Coordinates follow the sourcebook chart (908 x 1199 units, west at the top, north to the right). */

const CATS = {
  memory:"Cities & Memory", desire:"Cities & Desire", signs:"Cities & Signs", rigging:"Cities & Rope",
  trade:"Trading Cities", eyes:"Cities & Eyes", names:"Cities & Names", dead:"Cities & the Dead",
  sky:"Cities & the Sky", storms:"Cities & Storms", oaths:"Cities & Oaths", hidden:"Hidden Cities"
};

const DISTRICTS = {
  harbor:"The Harbor", cross:"Cross", market:"The Marketplace", forge:"Forgelight", respite:"Respite",
  silver:"Silverwall", oldgate:"Oldgate", temple:"The Temple District", south:"Southwatch", inn:"An inn", beyond:"Beyond the walls"
};

// One of six inns hosts the Traveler tonight; it moves on every visit.
const INNS = [[298,728,"the Wavecrest"],[312,462,"the Chapterhouse"],[602,232,"the Golden Wing"],[540,700,"the Open Palm"],[128,470,"the Ship's Cat"],[652,430,"the Anvilfire"]];
const INN_PICK = INNS[Math.floor(Math.random()*INNS.length)];

/* cam: optional view hint {az: degrees around the place (0 = from the sea side, +z), el: elevation degrees, d: distance} */
const PLACES = {
  "harbor":{n:"The Harbor",d:"harbor",x:262,y:686,cam:{az:345,el:20,d:30,h:2}},
  "harbor-docks":{n:"The docks",d:"harbor",x:330,y:770,cam:{az:200,el:16,d:20,h:1}},
  "fishers-folly":{n:"Fisher's Folly",d:"harbor",x:238,y:792,cam:{az:25,el:18,d:16}},
  "emperor":{n:"The Emperor",d:"harbor",x:72,y:776,cam:{az:-35,el:9,d:40,h:26}},
  "lighthouse":{n:"The Lighthouse",d:"harbor",x:126,y:828,cam:{az:75,el:10,d:22,h:6}},
  "shargons-talon":{n:"Shargon's Talon",d:"harbor",x:228,y:920,cam:{az:20,el:38,d:24,h:0}},
  "waterworks":{n:"The Waterworks",d:"harbor",x:118,y:648,cam:{az:35,el:64,d:20,h:-6,focus:[176,612]}},
  "riedran-consulate":{n:"The Riedran Consulate",d:"harbor",x:340,y:700,cam:{az:20,el:18,d:16,h:3}},
  "crypt-of-the-guard":{n:"The Crypt of the Guard",d:"harbor",x:180,y:706,cam:{az:15,el:20,d:16}},
  "scuppers":{n:"The scuppers",d:"harbor",x:208,y:612,cam:{az:10,el:35,d:24}},
  "dannels-pride":{n:"Dannel's Pride",d:"cross",x:404,y:566,cam:{az:20,el:35,d:22}},
  "cross":{n:"The rigging over Cross",d:"cross",x:352,y:620,cam:{az:-25,el:20,d:18,h:4}},
  "rubble-warren":{n:"The Rubble Warren",d:"cross",x:262,y:560,cam:{az:10,el:40,d:16}},
  "the-sloths":{n:"The Sloths",d:"cross",x:410,y:676,cam:{az:0,el:30,d:18}},
  "cross-hovel":{n:"A hovel in Cross",d:"cross",x:318,y:648,cam:{az:60,el:22,d:10,h:1}},
  "bazaar":{n:"The Bazaar",d:"market",x:350,y:440,cam:{az:15,el:12,d:18,h:3}},
  "molous":{n:"Molou's Distillery",d:"market",x:240,y:388,cam:{az:20,el:30,d:18}},
  "falconers-spire":{n:"Falconer's Spire",d:"market",x:476,y:430,cam:{az:-20,el:8,d:30,h:12}},
  "recruiters":{n:"The Stormreach Recruiters",d:"market",x:405,y:345,cam:{az:0,el:30,d:16}},
  "von-ruthveks":{n:"Von Ruthvek's",d:"market",x:300,y:352,cam:{az:20,el:30,d:16}},
  "old-catacombs":{n:"The Old Catacombs",d:"market",x:372,y:520,cam:{az:10,el:25,d:14}},
  "marketplace":{n:"Lorsmarch Palace",d:"market",x:343,y:292,cam:{az:0,el:24,d:28,h:3}},
  "marketplace-oath":{n:"Under the red tent",d:"market",x:286,y:432,cam:{az:40,el:30,d:16}},
  "circle-of-visions":{n:"A circle of standing stones",d:"market",x:430,y:392,cam:{az:30,el:34,d:12,h:1}},
  "stone-heads":{n:"Stone heads in Stormhaven",d:"respite",x:452,y:516,cam:{az:-40,el:24,d:13,h:1}},
  "hammersmiths":{n:"Hammersmith's Inn",d:"forge",x:560,y:428,cam:{az:0,el:30,d:18}},
  "iron-watch":{n:"The Watch House",d:"forge",x:636,y:352,cam:{az:-10,el:25,d:18}},
  "sovereign-host":{n:"The Temple of the Sovereign Host",d:"forge",x:607,y:400,cam:{az:20,el:20,d:18,h:3}},
  "delera-watch":{n:"Delera's Watch",d:"respite",x:705,y:687,cam:{az:-20,el:20,d:15,h:1}},
  "floating-ruins":{n:"The floating ruins",d:"respite",x:606,y:572,cam:{az:40,el:8,d:22,h:12}},
  "locksmith-square":{n:"Locksmith Square",d:"silver",x:470,y:822,cam:{az:0,el:24,d:22,h:3}},
  "eldreds-pool":{n:"Eldred's Pool",d:"silver",x:512,y:846,cam:{az:170,el:32,d:9,h:1}},
  "red-ring":{n:"The Red Ring",d:"silver",x:540,y:784,cam:{az:-15,el:30,d:13,h:1}},
  "black-wrack":{n:"The Black Wrack",d:"silver",x:588,y:764,cam:{az:20,el:25,d:14}},
  "shadows":{n:"Somewhere in Locksmith Square",d:"silver",x:440,y:790,cam:{az:40,el:20,d:12}},
  "kol-korran":{n:"The Tower of Kol Korran",d:"silver",x:660,y:985,cam:{az:-30,el:30,d:28,h:3}},
  "titan-cliffs":{n:"The cliffs past the shipyard",d:"silver",x:420,y:968,cam:{az:30,el:14,d:30,h:6}},
  "whitewash":{n:"Whitewash",d:"oldgate",x:440,y:66,cam:{az:90,el:16,d:24,h:4}},
  "temple-row":{n:"Temple Row",d:"temple",x:497,y:137,cam:{az:-55,el:28,d:16}},
  "twilight-streets":{n:"The Temple district at dusk",d:"temple",x:540,y:262,cam:{az:20,el:22,d:20}},
  "grindstone":{n:"Grindstone",d:"south",x:200,y:236,cam:{az:20,el:30,d:22}},
  "black-freighter":{n:"The Black Freighter",d:"south",x:150,y:196,cam:{az:315,el:22,d:12,h:.6}},
  "tents-of-rusheme":{n:"The Tents of Rushemé",d:"south",x:170,y:112,cam:{az:40,el:24,d:26}},
  "southwatch-edge":{n:"The edge of Southwatch",d:"south",x:58,y:340,cam:{look:"south"}},
  "travelers-inn":{n:"An inn (tonight, "+INN_PICK[2]+")",d:"inn",x:INN_PICK[0],y:INN_PICK[1],cam:{az:30,el:24,d:12}},
  "blackbriar":{n:"Blackbriar, up the coast",d:"beyond",x:872,y:410,cam:{az:-60,el:16,d:20,h:2}}
};

const NIGHTS = [
 ["harbor","emperor","stone-heads","rigging","bazaar"],
 ["dannels-pride","black-wrack","leaky-dinghy","recruiters","falconers-spire"],
 ["molous","tattered-alice","silverwall","delera-watch","scuppers"],
 ["shadows","eldreds-pool","crypt-of-the-guard","von-ruthveks","rubble-warren"],
 ["hammersmiths","circle-of-visions","red-ring","ivory-horn","burning-titan"],
 ["pirates-moon","night-tide","katanavash","fleas","grindstone"],
 ["god-man","tents-of-rusheme","floating-ruins","black-freighter","whitewash"],
 ["song-and-calling","kreldo","old-catacombs","wyrm-ascendant","iron-watch"],
 ["shacklebreak","blood-devil","shrouds","lighthouse","travelers-inn"],
 ["blackbriar","undercity","underharbor","kol-korran","the-horizon"]
];
const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X"];

/* What the city looks like on each night. rain 0..1, wind, special events. */
const NIGHT_STATES = [
  {rain:.9, lightning:.8, label:"A storm walks in off the Thunder Sea"},
  {rain:.55, lightning:.4, label:"Rain, and every bell in the harbor"},
  {rain:.7, lightning:.6, flood:true, label:"The scuppers running full"},
  {rain:.35, lightning:.2, fog:true, label:"Fog, with the floating stones lost in it"},
  {rain:.12, lightning:.1, titan:"burning", label:"The Burning Titan"},
  {rain:.08, lightning:0, offerings:true, moon:1, label:"Pirate's Moon"},
  {rain:.45, lightning:.3, label:"Warm rain out of the jungle"},
  {rain:.75, lightning:.7, label:"Lightning over Falconer's Spire"},
  {rain:.2, lightning:.2, bonfires:true, label:"Shacklebreak"},
  {rain:.05, lightning:0, calm:true, moon:.7, label:"A flat calm"}
];
const DAWN_STATE = {rain:0, lightning:0, dawn:true, calm:true, label:"Before dawn"};

const HEARD = {
 harbor:["Don't step on him. Don't step round him either, that's how they get your boots.","Is it Zor? Then we go the long way. The hobgoblins on those ships count anyone standing still as cargo.","Weighed by Berrigan, is it? Then what's left on the scale is yours. Roughly. Less.","First night ashore? My cousin keeps a room, very quiet, very cheap. Three doors down this alley. Mind the step."],
 cross:["Apples in brine! Red keeps you sweet, green keeps your teeth in your head!","Is that a real sword? Did it kill a giant? Did it kill two? Can I hold it? Can my sister hold it?","The Guard takes your coin and lets them break your shutters anyway. We take less, and your shutters stay on."],
 market:["Lassite's buying! No, he isn't. Somebody is, though, and it isn't me.","There's a giant's pipe in my wall that boils my washing and sings all night. Five petitions to the palace, and not one answer.","Thief! The girl in green! No, she gave it back. She gave it back empty!"],
 forge:["Deneith pays on the first of the month. The jungle pays on the last day you're alive. Sign here.","Look at his hands. Never lifted anything heavier than a book. You buying, scholar, or just reading the menu?","Line up! When I point, you step forward. Bite anybody and you'll be shoveling slag till Vult."],
 respite:["Mother says the prettier the house, the deeper the cellar, and you never ask what's down there.","Coldwake every dawn, winter or no. Coldest water in the city and the only water nobody's been sick in.","We have gardens here. Everyone else has flags."],
 silver:["The dwarf with only the one guard? Kundarak. One's all he needs, and you don't want to find out why.","Mikah in three. Rossart couldn't fold a napkin. Five silver says so.","Rob Shadows? Durko, they'll name a drink after you. A small one, and only for a week."],
 oldgate:["Barge downriver, five copper a head, boots stay dry. Going now. Going. Gone, if you dither.","They scrub it twice a day. I came halfway round the world for ruins and got my grandmother's parlor.","The Wands say we started it. We say the Wands started it. The war doesn't say anything. It stayed in Khorvaire."],
 temple:["A prayer for the god of the second stocking! The big gods won't miss it, and he's had a hard year!","No masks at the Conch, love, no glamours, no changelings. What walks in is what you paid for.","Six shrines on this street last week. Four this week. Mine's still standing, so mine's the true one."],
 south:["They're singing at the Tents tonight. Shut the river shutters and don't ask me why.","Seen a tabby? Striped like a mackerel, answers to nothing. He'll be at the Ship's Cat, begging off the shifter.","Keep your hands in your pockets in Grindstone. They count fingers on the way in and again on the way out."],
 inn:["Your room's the one with the loose board by the window. Everyone's is, somehow."],
 beyond:["Keep to the path. The briar can tell an invitation from a guess."]
};

const VISIONS = [
 [330,172,"A garden of glass trees, in which giants walk who are no taller than men."],
 [522,330,"A black tower over a stormy sea, with a railing of iron spikes, and on one spike a cloak you recognize."],
 [262,476,"A giant woman counting stars on an abacus strung with moons."],
 [468,612,"A giant whose name is lost, standing in the ring as if about to speak, who looks at you, thinks better of it, and fades."],
 [650,520,"A road of white stones through the jungle, every stone a giant's knucklebone, ending at a gate with no wall."],
 [116,420,"The harbor emptied of water, and the drowned streets beneath it lit and busy."],
 [600,690,"A door set into the floor of the sky, standing a little open."],
 [380,738,"Fire falling out of a clear sky onto a city of white stone, and on the cliff above it a figure that faces the other way."],
 [706,600,"Rows of mantis-folk bowing, their arms raised, holding up nothing at all."],
 [580,170,"Elves in iron collars carrying an empty chair through the jungle, who set it down, sit in a ring around it, and wait."],
 [226,330,"Snow falling on the jungle, and every bird in it silent, watching the flakes."],
 [500,960,"Your own face, much older, carved in stone among the heads in the gutter."]
];

const DRIFTS = ["You take a wrong turn in the narrows and come out at","A rope bridge carries you, swaying, over three roofs and sets you down at","The scupper takes your feet out from under you and leaves you, soaked, at","You follow a stranger's lantern until it goes out, and find yourself at","A Flea takes your hand, and then your purse, and leaves you at","You walk in the shadow of a floating stone until it drifts away and leaves you at","The street you knew yesterday has fallen into the giants' sewer. You go around it and arrive at"];

/* Chart shapes shared by the 2D chart and the 3D terrain (SVG path data in chart units). */
const SHAPES = {
  seaWest:"M0,600 C30,605 60,625 70,650 C76,690 52,740 58,775 C62,800 88,800 96,770 C104,735 112,708 160,702 L360,704 C372,730 360,780 376,830 C392,880 410,930 440,990 C470,1050 520,1110 560,1199 L0,1199 Z",
  seaEast:"M908,548 C870,540 830,548 806,580 C786,620 800,690 818,740 C826,800 800,880 768,960 C740,1030 708,1100 690,1199 L908,1199 Z",
  river1:"M690,0 C680,60 640,42 600,40 C540,38 520,100 470,96 C420,92 420,28 360,40 C300,52 300,124 258,152 C220,178 120,160 82,202 C42,246 42,322 50,400 C58,480 30,540 56,604",
  river2:"M690,0 C704,120 690,220 700,300 C710,380 690,430 722,470 C752,508 800,536 846,552",
  island:[126,830,26,18],
  roads:[
    "M70,640 C150,600 300,600 430,566 C470,540 490,480 520,470 C620,470 720,480 820,542",
    "M278,270 C290,180 296,80 300,0",
    "M278,270 C230,300 202,360 200,600",
    "M278,270 C360,262 440,262 520,250 C600,240 660,246 700,252",
    "M430,566 C450,640 446,700 452,752 C520,790 600,800 820,740",
    "M520,470 C490,540 470,600 452,752"
  ],
  city:"M40,250 C80,170 200,150 280,120 C330,60 420,20 520,40 C620,30 690,90 720,200 C740,300 720,420 760,500 C800,560 790,700 780,780 C760,900 720,1020 640,1060 C560,1080 480,1040 440,980 C400,900 380,820 360,710 L100,705 C80,690 60,660 50,600 C30,500 30,380 40,250 Z",
  jungle:["M760,0 L908,0 L908,540 L850,530 L800,480 L760,380 L780,260 L740,120 Z","M0,0 L230,0 L200,60 L120,90 L60,170 L0,200 Z","M0,500 L36,520 L30,610 L0,610 Z"]
};

const DISTRICT_LABELS = [
  ["Oldgate",388,150],["Temple",628,206],["Southwatch",140,300],["Marketplace",346,398],["Forgelight",600,322],
  ["Cross",350,598],["Harbor",232,664],["Respite",560,628],["Silverwall",500,912],["Coasthold",750,880]
];
