// Fallback pattern bank for The Island (used when no OpenAI key, and for "Surprise me" host mode).
// description = precise judging rule; starters = the two opening items; examples/nonExamples help a human judge.
export const ISLAND_PATTERNS = [
  {
    "name": "Things that can break",
    "description": "The item is something that can break, literally or idiomatically; English speakers commonly pair it with the verb 'break' (glass breaks, hearts break, records are broken, silence is broken). Reject items never naturally paired with 'break'.",
    "starters": [
      "Heart",
      "Window"
    ],
    "examples": [
      "Promise",
      "Glass",
      "Record",
      "Bone",
      "Silence"
    ],
    "nonExamples": [
      "Pillow",
      "Towel",
      "Sponge",
      "Sand"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Double letters",
    "description": "The item's name contains the same letter twice in a row (OO, TT, LL, etc.). Accept if any doubled adjacent letter appears anywhere in the spelling; reject otherwise.",
    "starters": [
      "Spoon",
      "Boots"
    ],
    "examples": [
      "Coffee",
      "Balloon",
      "Puzzle",
      "Mirror",
      "Kitten",
      "Hammock"
    ],
    "nonExamples": [
      "Fork",
      "Guitar",
      "Blanket",
      "Towel"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Things with teeth",
    "description": "The item has teeth; real anatomical teeth or parts conventionally called teeth (a comb's teeth, a saw's teeth, a zipper's teeth, a gear's teeth). Reject items whose parts are not called teeth.",
    "starters": [
      "Comb",
      "Saw"
    ],
    "examples": [
      "Zipper",
      "Shark",
      "Gear",
      "Crocodile",
      "Rake"
    ],
    "nonExamples": [
      "Knife",
      "Spoon",
      "Jellyfish",
      "Scissors"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Hidden numbers",
    "description": "The item's spelling contains a number word hidden inside it as consecutive letters: ONE, TWO, SIX, TEN, or NINE (bONE, kitTEN, caNINE, mONEy). Judge strictly on consecutive letters in the spelling.",
    "starters": [
      "Bone",
      "Kitten"
    ],
    "examples": [
      "Phone",
      "Stone",
      "Money",
      "Canine",
      "Honey",
      "Tent"
    ],
    "nonExamples": [
      "Calculator",
      "Clock",
      "Dice",
      "Calendar"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Bookend letters",
    "description": "The item's name begins and ends with the same letter (case-insensitive). Judge on spelling only, not sound.",
    "starters": [
      "Tent",
      "Sausages"
    ],
    "examples": [
      "Rooster",
      "Eye",
      "Gong",
      "Aroma",
      "Kayak"
    ],
    "nonExamples": [
      "Boot",
      "Windmill",
      "Torch",
      "Kite"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Rhymes with a body part",
    "description": "The item's name rhymes with a common part of the human body (arm, hand, ear, knee, hip, eye, thigh, back, toe, etc.). The host must be able to name the specific body part the word rhymes with; if none exists, reject.",
    "starters": [
      "Charm",
      "Sand"
    ],
    "examples": [
      "Deer",
      "Tea",
      "Ship",
      "Pie",
      "Snack",
      "Bow"
    ],
    "nonExamples": [
      "Boot",
      "Lamp",
      "Guitar",
      "Sofa"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Things that float",
    "description": "The item floats on water; its ordinary form is buoyant. Reject items that sink in water.",
    "starters": [
      "Cork",
      "Iceberg"
    ],
    "examples": [
      "Rubber duck",
      "Beach ball",
      "Log",
      "Coconut",
      "Buoy",
      "Lifejacket"
    ],
    "nonExamples": [
      "Anchor",
      "Coin",
      "Brick",
      "Bowling ball"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Made from ISLAND",
    "description": "The item's name uses only letters found in the word ISLAND (I, S, L, A, N, D; repeats allowed). Any letter outside that set disqualifies it (SANDALS fits; SAILBOAT fails because of B, O, T).",
    "starters": [
      "Sandals",
      "Snail"
    ],
    "examples": [
      "Sand",
      "Salad",
      "Nails",
      "Lid",
      "Sail"
    ],
    "nonExamples": [
      "Sailboat",
      "Sunscreen",
      "Lantern",
      "Towel"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Fire compounds",
    "description": "The item's word combines with FIRE to form a common English compound word or two-word phrase, with fire before or after it (CAMPfire, FIREfly, FIREwood, fire alarm). The host must be able to name the real compound.",
    "starters": [
      "Camp",
      "Fly"
    ],
    "examples": [
      "Wood",
      "Cracker",
      "Truck",
      "Alarm",
      "Escape",
      "Place"
    ],
    "nonExamples": [
      "Smoke",
      "Match",
      "Flame",
      "Heat"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Five letters exactly",
    "description": "The item's name is spelled with exactly five letters. Count letters only (ignore spaces for multi-word items, but prefer single words).",
    "starters": [
      "Zebra",
      "Bread"
    ],
    "examples": [
      "Chair",
      "Torch",
      "Apple",
      "Mango",
      "Knife"
    ],
    "nonExamples": [
      "Guitar",
      "Drum",
      "Banana",
      "Boat"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Things you can catch",
    "description": "The item is something you can 'catch' in ordinary English; literally (a ball, a fish, a butterfly) or idiomatically (a cold, a bus, your breath, a wave). The phrase 'catch a/the X' must be natural English.",
    "starters": [
      "Cold",
      "Ball"
    ],
    "examples": [
      "Fish",
      "Bus",
      "Breath",
      "Wave",
      "Butterfly",
      "Thief"
    ],
    "nonExamples": [
      "Table",
      "Soup",
      "Mountain",
      "Pillow"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Silent start",
    "description": "The item's name begins with a silent letter; the very first letter of the spelling is not pronounced (KNot, GNome, WRench). A silent letter elsewhere in the word does not count.",
    "starters": [
      "Gnome",
      "Wrench"
    ],
    "examples": [
      "Knot",
      "Knife",
      "Wreath",
      "Wristband",
      "Kneepads"
    ],
    "nonExamples": [
      "Ghost",
      "Nose",
      "Lamb",
      "Rope"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Things that come in pairs",
    "description": "The item conventionally comes as a pair or in twos (socks, dice, chopsticks, 'a pair of scissors'). Reject items normally used or sold singly.",
    "starters": [
      "Dice",
      "Socks"
    ],
    "examples": [
      "Scissors",
      "Chopsticks",
      "Glasses",
      "Shoes",
      "Headphones",
      "Gloves"
    ],
    "nonExamples": [
      "Hat",
      "Belt",
      "Necklace",
      "Spoon"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Homophones exist",
    "description": "The item's word has a homophone: a different English word spelled differently but pronounced identically (flour/flower, bear/bare, pear/pair). The host must be able to name the homophone.",
    "starters": [
      "Flour",
      "Bear"
    ],
    "examples": [
      "Pear",
      "Knight",
      "Mail",
      "Sole",
      "Hare",
      "Cellar"
    ],
    "nonExamples": [
      "Lamp",
      "Orange",
      "Pencil",
      "Cactus"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Two syllables",
    "description": "The item's name is pronounced with exactly two syllables. Judge by standard pronunciation.",
    "starters": [
      "Pillow",
      "Ketchup"
    ],
    "examples": [
      "Guitar",
      "Monkey",
      "Candle",
      "Bacon",
      "Ladder",
      "Sunscreen"
    ],
    "nonExamples": [
      "Boat",
      "Banana",
      "Sun",
      "Umbrella"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Secret body parts",
    "description": "The item's word has a second meaning as a human body part (PALM tree / palm of the hand, CALF, TEMPLE, PUPIL, SOLE, IRIS, CROWN). Words that mean ONLY a body part and nothing else do not count.",
    "starters": [
      "Palm",
      "Calf"
    ],
    "examples": [
      "Temple",
      "Pupil",
      "Iris",
      "Sole",
      "Crown"
    ],
    "nonExamples": [
      "Fern",
      "Knee",
      "Piano",
      "Chin"
    ],
    "difficulty": "medium"
  },
  {
    "name": "No letter repeats",
    "description": "No letter appears more than once in the item's name; every letter is unique (DOLPHIN, CUPBOARD). Reject any word containing a repeated letter, adjacent or not.",
    "starters": [
      "Dolphin",
      "Cupboard"
    ],
    "examples": [
      "Flute",
      "Bucket",
      "Yacht",
      "Wasp",
      "Orchid",
      "Jigsaw"
    ],
    "nonExamples": [
      "Banana",
      "Coconut",
      "Kayak",
      "Sunscreen"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Things that run",
    "description": "The item is something English speakers say 'runs'; literally or idiomatically (a nose runs, a river runs, an engine runs, stockings run, mascara runs). The phrase 'the X runs/is running' must be natural.",
    "starters": [
      "Nose",
      "River"
    ],
    "examples": [
      "Engine",
      "Clock",
      "Faucet",
      "Mascara",
      "Horse",
      "Stockings"
    ],
    "nonExamples": [
      "Chair",
      "Rock",
      "Pillow",
      "Lamp"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Yellow things",
    "description": "The item is characteristically yellow; yellow is the color most people picture when they imagine it. Reject items with no strong yellow association.",
    "starters": [
      "Taxi",
      "Lemon"
    ],
    "examples": [
      "Sunflower",
      "School bus",
      "Corn",
      "Canary",
      "Yolk"
    ],
    "nonExamples": [
      "Apple",
      "Grape",
      "Sky",
      "Strawberry"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Hidden animals",
    "description": "The item's spelling contains a hidden animal name as consecutive letters, and the item itself is not that animal (CARPet hides CARP, BATHrobe hides BAT, bOWL hides OWL, cRATe hides RAT). The host verifies the consecutive letters spell a real animal.",
    "starters": [
      "Carpet",
      "Bathrobe"
    ],
    "examples": [
      "Bowl",
      "Crate",
      "Scrabble",
      "Catapult",
      "Foxglove"
    ],
    "nonExamples": [
      "Leash",
      "Zoo",
      "Saddle",
      "Kennel"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Things you can open",
    "description": "The item is something you can open, literally or idiomatically (a door, a book, an umbrella, a mind, an account). The phrase 'open the/an X' must be natural English.",
    "starters": [
      "Mind",
      "Jar"
    ],
    "examples": [
      "Door",
      "Book",
      "Umbrella",
      "Bank account",
      "Bottle of wine",
      "Curtains"
    ],
    "nonExamples": [
      "Rock",
      "Towel",
      "Spoon",
      "Candle"
    ],
    "difficulty": "easy"
  },
  {
    "name": "The long E sound",
    "description": "Spoken aloud, the item's name contains the long E sound /ee/ anywhere (jeep, ski, pizza). Judge by sound, not spelling; BREAD has the letters EA but no long-E sound, so it fails.",
    "starters": [
      "Peach",
      "Ski"
    ],
    "examples": [
      "Jeep",
      "Key",
      "Genie",
      "Trampoline",
      "Beans",
      "Pizza"
    ],
    "nonExamples": [
      "Bread",
      "Pie",
      "Kettle",
      "Sun"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Anagram of another word",
    "description": "The item's word is an anagram of a different English word; the exact same letters rearranged spell something else (melon→lemon, horse→shore, plum→lump). The host must verify the rearranged word exists.",
    "starters": [
      "Melon",
      "Horse"
    ],
    "examples": [
      "Plum",
      "Cat",
      "Team",
      "Wolf",
      "Night"
    ],
    "nonExamples": [
      "Pizza",
      "Banana",
      "Kayak",
      "Coffee"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Things that melt",
    "description": "The item melts when warmed at everyday temperatures (ice cream, wax, chocolate, snow). Reject things that burn, evaporate, or stay solid instead of melting.",
    "starters": [
      "Snowman",
      "Butter"
    ],
    "examples": [
      "Ice cream",
      "Chocolate",
      "Wax",
      "Glacier",
      "Popsicle",
      "Cheese"
    ],
    "nonExamples": [
      "Wood",
      "Paper",
      "Egg",
      "Rock"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Rare letters",
    "description": "The item's name contains at least one of the letters Q, X, or Z anywhere in its spelling.",
    "starters": [
      "Xylophone",
      "Quilt"
    ],
    "examples": [
      "Zebra",
      "Pizza",
      "Axe",
      "Jacuzzi",
      "Box",
      "Quiche"
    ],
    "nonExamples": [
      "Knife",
      "Yacht",
      "Violin",
      "Kettle"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Things with keys",
    "description": "The item has parts called keys (piano keys, keyboard keys, saxophone keys, a map's key/legend). The item must HAVE keys; merely needing a key to operate, like a padlock or door, does not count.",
    "starters": [
      "Piano",
      "Map"
    ],
    "examples": [
      "Keyboard",
      "Saxophone",
      "Typewriter",
      "Flute",
      "Accordion"
    ],
    "nonExamples": [
      "Guitar",
      "Drum",
      "Violin",
      "Harmonica"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Left-hand typing",
    "description": "The item's name is typed entirely with the left hand on a QWERTY keyboard; only the letters Q W E R T A S D F G Z X C V B (WATER, VEST, GRASS). Any right-hand letter (Y U I O P H J K L N M) disqualifies it.",
    "starters": [
      "Water",
      "Vest"
    ],
    "examples": [
      "Dress",
      "Grass",
      "Cards",
      "Sweater",
      "Raft"
    ],
    "nonExamples": [
      "Juice",
      "Lamp",
      "Boat",
      "Knife"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Nouns that are also verbs",
    "description": "The item's exact word is also a common English verb with its own dictionary meaning (to duck, to book, to iron, to bolt). Judge by the dictionary: the identical word must function as a verb.",
    "starters": [
      "Duck",
      "Book"
    ],
    "examples": [
      "Watch",
      "Ship",
      "Iron",
      "Brush",
      "Bolt"
    ],
    "nonExamples": [
      "Sofa",
      "Pillow",
      "Guitar",
      "Banana"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Things that can fly",
    "description": "The item can fly, literally or idiomatically; it is commonly the subject of the verb 'fly' (kites fly, flags fly, time flies, sparks fly). Reject flightless near-misses like penguins.",
    "starters": [
      "Kite",
      "Time"
    ],
    "examples": [
      "Flag",
      "Airplane",
      "Eagle",
      "Drone",
      "Sparks"
    ],
    "nonExamples": [
      "Penguin",
      "Ostrich",
      "Car",
      "Boat"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Silent E ending",
    "description": "The item's name ends in the letter E, and that final E is silent when spoken (knife, rope, flute). Reject words whose final E is pronounced (karate, ukulele) or part of a spoken EE (coffee).",
    "starters": [
      "Knife",
      "Snake"
    ],
    "examples": [
      "Rope",
      "Cake",
      "Bike",
      "Flute",
      "Kite",
      "Cheese"
    ],
    "nonExamples": [
      "Coffee",
      "Karate",
      "Ukulele",
      "Tree"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Ever-longer items",
    "description": "Chain rule: each new item must have strictly MORE letters than the previous accepted item (Jam 3 → Belt 4 → Towel 5 → Basket 6). The very first item is always allowed. Judge each candidate only against the immediately previous accepted item.",
    "starters": [
      "Jam",
      "Belt"
    ],
    "examples": [
      "Towel (after Belt)",
      "Basket (after Towel)",
      "Blanket (after Basket)",
      "Sunshade (after Blanket)"
    ],
    "nonExamples": [
      "Tea (after Jam; not longer)",
      "Cap (after Belt; shorter)",
      "Towel (after Blanket; shorter)"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Things that shrink with use",
    "description": "The item physically gets smaller as you use it up (soap, pencil, candle, eraser). Reject things that merely wear out, break, or deplete without visibly shrinking.",
    "starters": [
      "Soap",
      "Pencil"
    ],
    "examples": [
      "Candle",
      "Eraser",
      "Toothpaste",
      "Chalk",
      "Perfume",
      "Lip balm"
    ],
    "nonExamples": [
      "Knife",
      "Cup",
      "Towel",
      "Hammer"
    ],
    "difficulty": "medium"
  },
  {
    "name": "One vowel only",
    "description": "The item's name contains exactly one vowel letter in total; count every occurrence of A, E, I, O, U (so TEETH with two E's fails). Y counts as a consonant.",
    "starters": [
      "Sphinx",
      "Drum"
    ],
    "examples": [
      "Sock",
      "Brush",
      "Shrimp",
      "Clock",
      "Belt",
      "Scarf"
    ],
    "nonExamples": [
      "Boat",
      "Kite",
      "Umbrella",
      "Canoe"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Found in a deck of cards",
    "description": "The item's word names something found in a standard deck of playing cards: king, queen, jack, ace, joker, or the suits heart, diamond, club, spade. Anything not in a deck fails.",
    "starters": [
      "Spade",
      "Diamond"
    ],
    "examples": [
      "King",
      "Queen",
      "Club",
      "Joker",
      "Ace",
      "Heart"
    ],
    "nonExamples": [
      "Crown",
      "Sword",
      "Coin",
      "Castle"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Things with buttons",
    "description": "The item has buttons; physical press-buttons or clothing buttons (a shirt's buttons, an elevator's buttons, a belly button counts). Reject items fastened or operated another way.",
    "starters": [
      "Shirt",
      "Elevator"
    ],
    "examples": [
      "Remote control",
      "Coat",
      "Belly",
      "Jacket",
      "Calculator"
    ],
    "nonExamples": [
      "Socks",
      "Scarf",
      "Mug",
      "Slippers"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Alphabetical order",
    "description": "Reading the item's spelling left to right, each letter is the same as or later in the alphabet than the letter before it (CHIPS: C-H-I-P-S; BELLS: B-E-L-L-S). One out-of-order letter disqualifies it.",
    "starters": [
      "Chips",
      "Knot"
    ],
    "examples": [
      "Fort",
      "Ghost",
      "Floss",
      "Bells",
      "Dirt"
    ],
    "nonExamples": [
      "Salt",
      "Tent",
      "Chair",
      "Knife"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Things that grow",
    "description": "The item grows; it naturally gets bigger over time (plants, hair, babies, debts). Reject things that stay the same size or shrink.",
    "starters": [
      "Beard",
      "Debt"
    ],
    "examples": [
      "Plant",
      "Baby",
      "Hair",
      "Fingernails",
      "Tree",
      "Crystal"
    ],
    "nonExamples": [
      "Rock",
      "Spoon",
      "Photograph",
      "Candle"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Idiom words",
    "description": "The item's word appears in a well-known English idiom or saying, and the host can name that idiom (kick the BUCKET, spill the BEANS, piece of CAKE, break the ICE). Reject words for which no famous idiom can be named.",
    "starters": [
      "Bucket",
      "Beans"
    ],
    "examples": [
      "Cake",
      "Ice",
      "Music",
      "Towel",
      "Cat"
    ],
    "nonExamples": [
      "Laptop",
      "Zucchini",
      "Stapler",
      "Wifi router"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Vowel-heavy words",
    "description": "The item's name contains strictly more vowel letters (A, E, I, O, U) than consonant letters (OCEAN: 3 vowels vs 2 consonants). Ties fail. Y counts as a consonant.",
    "starters": [
      "Ocean",
      "Cookie"
    ],
    "examples": [
      "Oboe",
      "Audio",
      "Aquarium",
      "Igloo",
      "Radio"
    ],
    "nonExamples": [
      "Water",
      "Beach",
      "Boat",
      "Sand"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Hard C",
    "description": "The item's name starts with the letter C pronounced as a hard K sound (cactus, cup, crab). Reject soft-C words (city, celery) and words spelled with K.",
    "starters": [
      "Cactus",
      "Canoe"
    ],
    "examples": [
      "Coconut",
      "Candle",
      "Cup",
      "Crab",
      "Coat"
    ],
    "nonExamples": [
      "Celery",
      "Cymbals",
      "Kite",
      "Cellphone"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Things on wheels",
    "description": "The item has wheels or takes the form of a wheel (a rolling suitcase, a bicycle, a wheel of cheese, a ferris wheel). Reject things that move or work without wheels.",
    "starters": [
      "Suitcase",
      "Cheese"
    ],
    "examples": [
      "Bicycle",
      "Skateboard",
      "Wheelbarrow",
      "Office chair",
      "Rollerblades"
    ],
    "nonExamples": [
      "Sled",
      "Canoe",
      "Horse",
      "Ladder"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Ants in the pants",
    "description": "The item's name contains the consecutive letters A-N-T somewhere in its spelling (pANTs, plANT, elephANT). Reject words where A, N, T appear but not consecutively.",
    "starters": [
      "Pants",
      "Lantern"
    ],
    "examples": [
      "Plant",
      "Giant",
      "Elephant",
      "Croissant",
      "Antenna"
    ],
    "nonExamples": [
      "Blanket",
      "Anchor",
      "Banana",
      "Tuna"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Beheadable words",
    "description": "Removing the first letter of the item's name leaves a real English word (Glove→love, Fox→ox, Chair→hair, Stool→tool). The host verifies the remaining letters form a dictionary word.",
    "starters": [
      "Glove",
      "Fox"
    ],
    "examples": [
      "Chair",
      "Stool",
      "Scar",
      "Brush",
      "Pearl"
    ],
    "nonExamples": [
      "Plant",
      "Spoon",
      "Knife",
      "Candle"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Things with a head",
    "description": "The item has a part conventionally called its head (a hammer's head, a pin head, a match head, the head of a bed, a head of lettuce, the head on a beer).",
    "starters": [
      "Hammer",
      "Lettuce"
    ],
    "examples": [
      "Bed",
      "Pin",
      "Match",
      "Beer",
      "Nail",
      "Drum"
    ],
    "nonExamples": [
      "Spoon",
      "Ladder",
      "Towel",
      "Cup"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Also a first name",
    "description": "The item's word is also a common first name for a person (Daisy, Jack, Rose, Bill, Penny). It must be widely recognizable as a name on its own.",
    "starters": [
      "Daisy",
      "Jack"
    ],
    "examples": [
      "Rose",
      "Bill",
      "Mark",
      "Penny",
      "Jasmine",
      "Robin"
    ],
    "nonExamples": [
      "Tulip",
      "Hammer",
      "Coin",
      "Bucket"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Vowel sounds at both ends",
    "description": "Spoken aloud, the item's name both starts and ends with a vowel sound. Judge by pronunciation, not spelling: HOUR starts with a vowel sound despite the H, while UKULELE starts with a 'y' consonant sound and fails.",
    "starters": [
      "Igloo",
      "Avocado"
    ],
    "examples": [
      "Umbrella",
      "Espresso",
      "Origami",
      "Iguana",
      "Echo"
    ],
    "nonExamples": [
      "Ukulele",
      "Apple",
      "Egg",
      "Orange"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Things that are hollow",
    "description": "The item is hollow; its normal form has an empty space or open channel inside (straw, pipe, snorkel, bamboo). Reject solid items.",
    "starters": [
      "Straw",
      "Bamboo"
    ],
    "examples": [
      "Pipe",
      "Snorkel",
      "Tube",
      "Didgeridoo",
      "Garden hose"
    ],
    "nonExamples": [
      "Brick",
      "Potato",
      "Coin",
      "Watermelon"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Last-letter chain",
    "description": "Chain rule: each new item must begin with the LAST letter of the most recently accepted item (Sofa → Apple → Egg → Guitar → Raincoat). The very first item is always allowed. Judge each candidate against the item accepted immediately before it.",
    "starters": [
      "Sofa",
      "Apple"
    ],
    "examples": [
      "Egg (after Apple)",
      "Guitar (after Egg)",
      "Raincoat (after Guitar)",
      "Tent (after Raincoat)"
    ],
    "nonExamples": [
      "Banana (after Sofa; must start with A)",
      "Kite (after Egg; must start with G)",
      "Hat (after Guitar; must start with R)"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Board compounds",
    "description": "The item's word combines with BOARD to form a common English compound (SURFboard, CUPboard, KEYboard, CARDboard, CHALKboard). The host must be able to name the real compound.",
    "starters": [
      "Surf",
      "Cup"
    ],
    "examples": [
      "Key",
      "Skate",
      "Card",
      "Chalk",
      "Snow",
      "Dart"
    ],
    "nonExamples": [
      "Wood",
      "Fish",
      "Lamp",
      "Rope"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Things you plug in",
    "description": "The item runs on mains electricity; it is normally plugged into a wall outlet to work. Reject battery-free, manual, or non-electric items.",
    "starters": [
      "Toaster",
      "Lamp"
    ],
    "examples": [
      "Refrigerator",
      "Kettle",
      "Television",
      "Blender",
      "Vacuum cleaner"
    ],
    "nonExamples": [
      "Candle",
      "Bicycle",
      "Book",
      "Whisk"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Triple letter",
    "description": "Some single letter appears at least THREE times in the item's spelling (PINEAPPLE has three P's, BANANA three A's). A letter appearing only twice is not enough.",
    "starters": [
      "Pineapple",
      "Banana"
    ],
    "examples": [
      "Sausages",
      "Bubbles",
      "Teepee",
      "Alfalfa",
      "Evergreen"
    ],
    "nonExamples": [
      "Coconut",
      "Mango",
      "Kiwi",
      "Melon"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Things with rings",
    "description": "The item is strongly associated with rings: it has or produces ring shapes (Saturn's rings, onion rings, tree rings, a bathtub ring) or it audibly rings (bell, telephone). The host must name the ring connection.",
    "starters": [
      "Saturn",
      "Onion"
    ],
    "examples": [
      "Tree",
      "Telephone",
      "Circus",
      "Bell",
      "Bathtub"
    ],
    "nonExamples": [
      "Moon",
      "Potato",
      "Drum",
      "Whistle"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Palindromes",
    "description": "The item's word is a palindrome; spelled exactly the same forwards and backwards (kayak, level, racecar). Judge on spelling, ignoring spaces and capitalization.",
    "starters": [
      "Kayak",
      "Level"
    ],
    "examples": [
      "Radar",
      "Racecar",
      "Civic",
      "Eye"
    ],
    "nonExamples": [
      "Canoe",
      "Mirror",
      "Ladder",
      "Rowboat"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Things with tails",
    "description": "The item has a tail; an animal's tail or a named tail part (a comet's tail, a kite's tail, a coin's tails side, tuxedo tails, an airplane's tail). Reject animals and objects without one.",
    "starters": [
      "Comet",
      "Monkey"
    ],
    "examples": [
      "Dog",
      "Coin",
      "Airplane",
      "Tuxedo",
      "Squirrel"
    ],
    "nonExamples": [
      "Frog",
      "Spider",
      "Worm",
      "Ball"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Secretly a place",
    "description": "The item's word is also the name of a real country, city, region, or island (turkey/Turkey, china/China, jersey/Jersey, java/Java, phoenix/Phoenix). The host must be able to name the place.",
    "starters": [
      "Turkey",
      "China"
    ],
    "examples": [
      "Jersey",
      "Cologne",
      "Panama",
      "Java",
      "Phoenix"
    ],
    "nonExamples": [
      "Croissant",
      "Pizza",
      "Sombrero",
      "Bagel"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Alternating letters",
    "description": "The item's spelling strictly alternates consonant, vowel, consonant, vowel... all the way through, starting with either (CAMERA = C-A-M-E-R-A). Any two adjacent vowels or two adjacent consonants disqualify it. Y counts as a consonant.",
    "starters": [
      "Camera",
      "Tomato"
    ],
    "examples": [
      "Kimono",
      "Salami",
      "Pajamas",
      "Lemonade",
      "Banana"
    ],
    "nonExamples": [
      "Apple",
      "Guitar",
      "Bread",
      "Spoon"
    ],
    "difficulty": "hard"
  },
  {
    "name": "Things that fold",
    "description": "The item is commonly folded in everyday life, literally (napkin, map, deckchair, laundry) or idiomatically (folding a poker hand). Reject rigid items that cannot fold.",
    "starters": [
      "Napkin",
      "Deckchair"
    ],
    "examples": [
      "Map",
      "Laundry",
      "Paper",
      "Blanket",
      "Poker hand",
      "Tent"
    ],
    "nonExamples": [
      "Glass",
      "Brick",
      "Coin",
      "Bowl"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Irregular plurals",
    "description": "The item's word has an irregular plural; its standard plural is NOT formed by simply adding -s or -es (mouse→mice, goose→geese, leaf→leaves, die→dice, cactus→cacti). Unchanged plurals like sheep also count.",
    "starters": [
      "Mouse",
      "Goose"
    ],
    "examples": [
      "Ox",
      "Tooth",
      "Die",
      "Leaf",
      "Cactus"
    ],
    "nonExamples": [
      "Duck",
      "Dog",
      "Box",
      "Horse"
    ],
    "difficulty": "medium"
  },
  {
    "name": "Things with strings",
    "description": "The item has one or more strings as a normal part of it (a guitar's strings, a puppet's strings, a kite string, a yo-yo's string, a racket's strings). Reject stringless items.",
    "starters": [
      "Puppet",
      "Tennis racket"
    ],
    "examples": [
      "Guitar",
      "Violin",
      "Harp",
      "Yo-yo",
      "Archery bow"
    ],
    "nonExamples": [
      "Drum",
      "Flute",
      "Ball",
      "Trumpet"
    ],
    "difficulty": "easy"
  },
  {
    "name": "Never the letter E",
    "description": "The item's name contains no letter E anywhere in its spelling. A single E disqualifies it (FLAMINGO fits; TENT does not). Sneaky because E is the most common letter; players' guesses usually contain one.",
    "starters": [
      "Flamingo",
      "Surfboard"
    ],
    "examples": [
      "Hammock",
      "Piano",
      "Snacks",
      "Yoga mat",
      "Sunhat"
    ],
    "nonExamples": [
      "Sunscreen",
      "Towel",
      "Tent",
      "Umbrella"
    ],
    "difficulty": "hard"
  }
];
