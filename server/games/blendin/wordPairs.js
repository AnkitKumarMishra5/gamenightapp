// Fallback word-pair bank for Blend In. The AI deals a fresh pair every game; this is
// what the game uses when there is no API key, or when the model returns something
// unplayable. Curated to be similar enough that clues overlap and distinct enough that a
// careful table can still catch the impostor.
//
// Tiers match the AI's: easy (obviously different), medium (close cousins), hard (barely
// a gap), ultra (near-synonyms).
export const WORD_PAIRS = [
  {
    "a": "Coffee",
    "b": "Tea",
    "category": "food & drink",
    "difficulty": "easy"
  },
  {
    "a": "Pizza",
    "b": "Burger",
    "category": "food & drink",
    "difficulty": "easy"
  },
  {
    "a": "Beer",
    "b": "Wine",
    "category": "food & drink",
    "difficulty": "easy"
  },
  {
    "a": "Salt",
    "b": "Sugar",
    "category": "food & drink",
    "difficulty": "easy"
  },
  {
    "a": "Ketchup",
    "b": "Mustard",
    "category": "food & drink",
    "difficulty": "easy"
  },
  {
    "a": "Bread",
    "b": "Cake",
    "category": "food & drink",
    "difficulty": "easy"
  },
  {
    "a": "Apple",
    "b": "Pear",
    "category": "food & drink",
    "difficulty": "easy"
  },
  {
    "a": "Orange",
    "b": "Lemon",
    "category": "food & drink",
    "difficulty": "easy"
  },
  {
    "a": "Rice",
    "b": "Noodles",
    "category": "food & drink",
    "difficulty": "easy"
  },
  {
    "a": "Butter",
    "b": "Cheese",
    "category": "food & drink",
    "difficulty": "medium"
  },
  {
    "a": "Pancake",
    "b": "Waffle",
    "category": "food & drink",
    "difficulty": "medium"
  },
  {
    "a": "Garlic",
    "b": "Onion",
    "category": "food & drink",
    "difficulty": "medium"
  },
  {
    "a": "Ice cream",
    "b": "Yogurt",
    "category": "food & drink",
    "difficulty": "medium"
  },
  {
    "a": "Chocolate",
    "b": "Caramel",
    "category": "food & drink",
    "difficulty": "medium"
  },
  {
    "a": "Juice",
    "b": "Smoothie",
    "category": "food & drink",
    "difficulty": "medium"
  },
  {
    "a": "Jam",
    "b": "Marmalade",
    "category": "food & drink",
    "difficulty": "hard"
  },
  {
    "a": "Soup",
    "b": "Stew",
    "category": "food & drink",
    "difficulty": "hard"
  },
  {
    "a": "Donut",
    "b": "Bagel",
    "category": "food & drink",
    "difficulty": "hard"
  },
  {
    "a": "Strawberry",
    "b": "Raspberry",
    "category": "food & drink",
    "difficulty": "hard"
  },
  {
    "a": "Cat",
    "b": "Tiger",
    "category": "animals",
    "difficulty": "easy"
  },
  {
    "a": "Dog",
    "b": "Wolf",
    "category": "animals",
    "difficulty": "easy"
  },
  {
    "a": "Dolphin",
    "b": "Shark",
    "category": "animals",
    "difficulty": "easy"
  },
  {
    "a": "Horse",
    "b": "Donkey",
    "category": "animals",
    "difficulty": "easy"
  },
  {
    "a": "Sheep",
    "b": "Goat",
    "category": "animals",
    "difficulty": "medium"
  },
  {
    "a": "Duck",
    "b": "Goose",
    "category": "animals",
    "difficulty": "medium"
  },
  {
    "a": "Eagle",
    "b": "Owl",
    "category": "animals",
    "difficulty": "medium"
  },
  {
    "a": "Penguin",
    "b": "Ostrich",
    "category": "animals",
    "difficulty": "medium"
  },
  {
    "a": "Lion",
    "b": "Leopard",
    "category": "animals",
    "difficulty": "medium"
  },
  {
    "a": "Rabbit",
    "b": "Kangaroo",
    "category": "animals",
    "difficulty": "medium"
  },
  {
    "a": "Frog",
    "b": "Toad",
    "category": "animals",
    "difficulty": "hard"
  },
  {
    "a": "Crocodile",
    "b": "Alligator",
    "category": "animals",
    "difficulty": "hard"
  },
  {
    "a": "Bee",
    "b": "Wasp",
    "category": "animals",
    "difficulty": "hard"
  },
  {
    "a": "Butterfly",
    "b": "Moth",
    "category": "animals",
    "difficulty": "hard"
  },
  {
    "a": "Turtle",
    "b": "Tortoise",
    "category": "animals",
    "difficulty": "hard"
  },
  {
    "a": "Mouse",
    "b": "Rat",
    "category": "animals",
    "difficulty": "hard"
  },
  {
    "a": "Beach",
    "b": "Desert",
    "category": "places",
    "difficulty": "easy"
  },
  {
    "a": "Zoo",
    "b": "Aquarium",
    "category": "places",
    "difficulty": "easy"
  },
  {
    "a": "Paris",
    "b": "London",
    "category": "places",
    "difficulty": "easy"
  },
  {
    "a": "Village",
    "b": "City",
    "category": "places",
    "difficulty": "easy"
  },
  {
    "a": "Hospital",
    "b": "Pharmacy",
    "category": "places",
    "difficulty": "medium"
  },
  {
    "a": "School",
    "b": "University",
    "category": "places",
    "difficulty": "medium"
  },
  {
    "a": "Cinema",
    "b": "Theater",
    "category": "places",
    "difficulty": "medium"
  },
  {
    "a": "Restaurant",
    "b": "Cafe",
    "category": "places",
    "difficulty": "medium"
  },
  {
    "a": "Supermarket",
    "b": "Mall",
    "category": "places",
    "difficulty": "medium"
  },
  {
    "a": "Church",
    "b": "Temple",
    "category": "places",
    "difficulty": "medium"
  },
  {
    "a": "Hotel",
    "b": "Hostel",
    "category": "places",
    "difficulty": "hard"
  },
  {
    "a": "Museum",
    "b": "Gallery",
    "category": "places",
    "difficulty": "hard"
  },
  {
    "a": "Library",
    "b": "Bookstore",
    "category": "places",
    "difficulty": "hard"
  },
  {
    "a": "Park",
    "b": "Garden",
    "category": "places",
    "difficulty": "hard"
  },
  {
    "a": "Doctor",
    "b": "Nurse",
    "category": "professions",
    "difficulty": "easy"
  },
  {
    "a": "Pilot",
    "b": "Astronaut",
    "category": "professions",
    "difficulty": "easy"
  },
  {
    "a": "Actor",
    "b": "Singer",
    "category": "professions",
    "difficulty": "easy"
  },
  {
    "a": "Firefighter",
    "b": "Police officer",
    "category": "professions",
    "difficulty": "easy"
  },
  {
    "a": "Chef",
    "b": "Baker",
    "category": "professions",
    "difficulty": "medium"
  },
  {
    "a": "Teacher",
    "b": "Professor",
    "category": "professions",
    "difficulty": "medium"
  },
  {
    "a": "Lawyer",
    "b": "Judge",
    "category": "professions",
    "difficulty": "medium"
  },
  {
    "a": "Waiter",
    "b": "Bartender",
    "category": "professions",
    "difficulty": "medium"
  },
  {
    "a": "Plumber",
    "b": "Electrician",
    "category": "professions",
    "difficulty": "medium"
  },
  {
    "a": "Dentist",
    "b": "Veterinarian",
    "category": "professions",
    "difficulty": "medium"
  },
  {
    "a": "Architect",
    "b": "Engineer",
    "category": "professions",
    "difficulty": "medium"
  },
  {
    "a": "Photographer",
    "b": "Painter",
    "category": "professions",
    "difficulty": "medium"
  },
  {
    "a": "Barber",
    "b": "Hairdresser",
    "category": "professions",
    "difficulty": "hard"
  },
  {
    "a": "Piano",
    "b": "Guitar",
    "category": "objects",
    "difficulty": "easy"
  },
  {
    "a": "Fork",
    "b": "Spoon",
    "category": "objects",
    "difficulty": "easy"
  },
  {
    "a": "Hammer",
    "b": "Screwdriver",
    "category": "objects",
    "difficulty": "easy"
  },
  {
    "a": "Ring",
    "b": "Necklace",
    "category": "objects",
    "difficulty": "easy"
  },
  {
    "a": "Pillow",
    "b": "Blanket",
    "category": "objects",
    "difficulty": "easy"
  },
  {
    "a": "Mirror",
    "b": "Window",
    "category": "objects",
    "difficulty": "medium"
  },
  {
    "a": "Umbrella",
    "b": "Tent",
    "category": "objects",
    "difficulty": "medium"
  },
  {
    "a": "Candle",
    "b": "Lamp",
    "category": "objects",
    "difficulty": "medium"
  },
  {
    "a": "Backpack",
    "b": "Suitcase",
    "category": "objects",
    "difficulty": "medium"
  },
  {
    "a": "Scissors",
    "b": "Knife",
    "category": "objects",
    "difficulty": "medium"
  },
  {
    "a": "Broom",
    "b": "Vacuum",
    "category": "objects",
    "difficulty": "medium"
  },
  {
    "a": "Towel",
    "b": "Napkin",
    "category": "objects",
    "difficulty": "medium"
  },
  {
    "a": "Pen",
    "b": "Pencil",
    "category": "objects",
    "difficulty": "hard"
  },
  {
    "a": "Clock",
    "b": "Watch",
    "category": "objects",
    "difficulty": "hard"
  },
  {
    "a": "Ladder",
    "b": "Stairs",
    "category": "objects",
    "difficulty": "hard"
  },
  {
    "a": "Gloves",
    "b": "Mittens",
    "category": "objects",
    "difficulty": "hard"
  },
  {
    "a": "Sofa",
    "b": "Armchair",
    "category": "objects",
    "difficulty": "hard"
  },
  {
    "a": "Football",
    "b": "Basketball",
    "category": "activities & sports",
    "difficulty": "easy"
  },
  {
    "a": "Running",
    "b": "Hiking",
    "category": "activities & sports",
    "difficulty": "easy"
  },
  {
    "a": "Birthday",
    "b": "Wedding",
    "category": "activities & sports",
    "difficulty": "easy"
  },
  {
    "a": "Christmas",
    "b": "New Year",
    "category": "activities & sports",
    "difficulty": "easy"
  },
  {
    "a": "Swimming",
    "b": "Diving",
    "category": "activities & sports",
    "difficulty": "medium"
  },
  {
    "a": "Boxing",
    "b": "Wrestling",
    "category": "activities & sports",
    "difficulty": "medium"
  },
  {
    "a": "Tennis",
    "b": "Badminton",
    "category": "activities & sports",
    "difficulty": "medium"
  },
  {
    "a": "Chess",
    "b": "Checkers",
    "category": "activities & sports",
    "difficulty": "medium"
  },
  {
    "a": "Skiing",
    "b": "Snowboarding",
    "category": "activities & sports",
    "difficulty": "medium"
  },
  {
    "a": "Fishing",
    "b": "Hunting",
    "category": "activities & sports",
    "difficulty": "medium"
  },
  {
    "a": "Dancing",
    "b": "Gymnastics",
    "category": "activities & sports",
    "difficulty": "medium"
  },
  {
    "a": "Golf",
    "b": "Baseball",
    "category": "activities & sports",
    "difficulty": "medium"
  },
  {
    "a": "Surfing",
    "b": "Skateboarding",
    "category": "activities & sports",
    "difficulty": "medium"
  },
  {
    "a": "Yoga",
    "b": "Pilates",
    "category": "activities & sports",
    "difficulty": "hard"
  },
  {
    "a": "Karate",
    "b": "Judo",
    "category": "activities & sports",
    "difficulty": "hard"
  },
  {
    "a": "Marathon",
    "b": "Sprint",
    "category": "activities & sports",
    "difficulty": "hard"
  },
  {
    "a": "Batman",
    "b": "Spiderman",
    "category": "entertainment",
    "difficulty": "easy"
  },
  {
    "a": "Instagram",
    "b": "TikTok",
    "category": "entertainment",
    "difficulty": "easy"
  },
  {
    "a": "Netflix",
    "b": "YouTube",
    "category": "entertainment",
    "difficulty": "easy"
  },
  {
    "a": "Shrek",
    "b": "Minions",
    "category": "entertainment",
    "difficulty": "easy"
  },
  {
    "a": "Mario",
    "b": "Sonic",
    "category": "entertainment",
    "difficulty": "medium"
  },
  {
    "a": "James Bond",
    "b": "Sherlock Holmes",
    "category": "entertainment",
    "difficulty": "medium"
  },
  {
    "a": "Cinderella",
    "b": "Elsa",
    "category": "entertainment",
    "difficulty": "medium"
  },
  {
    "a": "Karaoke",
    "b": "Concert",
    "category": "entertainment",
    "difficulty": "medium"
  },
  {
    "a": "Podcast",
    "b": "Radio",
    "category": "entertainment",
    "difficulty": "medium"
  },
  {
    "a": "Google",
    "b": "Wikipedia",
    "category": "entertainment",
    "difficulty": "medium"
  },
  {
    "a": "Circus",
    "b": "Carnival",
    "category": "entertainment",
    "difficulty": "hard"
  },
  {
    "a": "Rain",
    "b": "Snow",
    "category": "nature",
    "difficulty": "easy"
  },
  {
    "a": "Sun",
    "b": "Moon",
    "category": "nature",
    "difficulty": "easy"
  },
  {
    "a": "River",
    "b": "Lake",
    "category": "nature",
    "difficulty": "easy"
  },
  {
    "a": "Rose",
    "b": "Tulip",
    "category": "nature",
    "difficulty": "medium"
  },
  {
    "a": "Star",
    "b": "Planet",
    "category": "nature",
    "difficulty": "medium"
  },
  {
    "a": "Mountain",
    "b": "Volcano",
    "category": "nature",
    "difficulty": "medium"
  },
  {
    "a": "Waterfall",
    "b": "Fountain",
    "category": "nature",
    "difficulty": "medium"
  },
  {
    "a": "Thunder",
    "b": "Lightning",
    "category": "nature",
    "difficulty": "hard"
  },
  {
    "a": "Forest",
    "b": "Jungle",
    "category": "nature",
    "difficulty": "hard"
  },
  {
    "a": "Cloud",
    "b": "Fog",
    "category": "nature",
    "difficulty": "hard"
  },
  {
    "a": "Tornado",
    "b": "Hurricane",
    "category": "nature",
    "difficulty": "hard"
  },
  {
    "a": "Car",
    "b": "Motorcycle",
    "category": "transport",
    "difficulty": "easy"
  },
  {
    "a": "Bus",
    "b": "Train",
    "category": "transport",
    "difficulty": "easy"
  },
  {
    "a": "Airplane",
    "b": "Helicopter",
    "category": "transport",
    "difficulty": "easy"
  },
  {
    "a": "Boat",
    "b": "Submarine",
    "category": "transport",
    "difficulty": "easy"
  },
  {
    "a": "Bicycle",
    "b": "Scooter",
    "category": "transport",
    "difficulty": "medium"
  },
  {
    "a": "Taxi",
    "b": "Uber",
    "category": "transport",
    "difficulty": "medium"
  },
  {
    "a": "Rocket",
    "b": "Satellite",
    "category": "transport",
    "difficulty": "medium"
  },
  {
    "a": "Truck",
    "b": "Van",
    "category": "transport",
    "difficulty": "hard"
  },
  {
    "a": "Love",
    "b": "Friendship",
    "category": "abstract & feelings",
    "difficulty": "medium"
  },
  {
    "a": "Dream",
    "b": "Memory",
    "category": "abstract & feelings",
    "difficulty": "medium"
  },
  {
    "a": "Secret",
    "b": "Lie",
    "category": "abstract & feelings",
    "difficulty": "medium"
  },
  {
    "a": "Fear",
    "b": "Excitement",
    "category": "abstract & feelings",
    "difficulty": "hard"
  },
  {
    "a": "Luck",
    "b": "Destiny",
    "category": "abstract & feelings",
    "difficulty": "hard"
  },
  {
    "a": "Ocean",
    "b": "Sea",
    "category": "nature",
    "difficulty": "ultra"
  },
  {
    "a": "Hill",
    "b": "Mountain",
    "category": "nature",
    "difficulty": "ultra"
  },
  {
    "a": "Sofa",
    "b": "Couch",
    "category": "objects",
    "difficulty": "ultra"
  },
  {
    "a": "Jacket",
    "b": "Coat",
    "category": "clothing",
    "difficulty": "ultra"
  },
  {
    "a": "Cup",
    "b": "Mug",
    "category": "objects",
    "difficulty": "ultra"
  },
  {
    "a": "Rug",
    "b": "Carpet",
    "category": "objects",
    "difficulty": "ultra"
  },
  {
    "a": "Bag",
    "b": "Sack",
    "category": "objects",
    "difficulty": "ultra"
  },
  {
    "a": "Boat",
    "b": "Ship",
    "category": "vehicles",
    "difficulty": "ultra"
  },
  {
    "a": "Road",
    "b": "Street",
    "category": "places",
    "difficulty": "ultra"
  },
  {
    "a": "Pond",
    "b": "Lake",
    "category": "nature",
    "difficulty": "ultra"
  },
  {
    "a": "Movie",
    "b": "Film",
    "category": "entertainment",
    "difficulty": "ultra"
  },
  {
    "a": "Sweater",
    "b": "Jumper",
    "category": "clothing",
    "difficulty": "ultra"
  },
  {
    "a": "Rock",
    "b": "Stone",
    "category": "nature",
    "difficulty": "ultra"
  },
  {
    "a": "Cookie",
    "b": "Biscuit",
    "category": "food & drink",
    "difficulty": "ultra"
  },
  {
    "a": "Purse",
    "b": "Handbag",
    "category": "objects",
    "difficulty": "ultra"
  },
  {
    "a": "Trousers",
    "b": "Pants",
    "category": "clothing",
    "difficulty": "ultra"
  },
  {
    "a": "Lawyer",
    "b": "Attorney",
    "category": "professions",
    "difficulty": "ultra"
  },
  {
    "a": "Sofa bed",
    "b": "Futon",
    "category": "objects",
    "difficulty": "ultra"
  }
];
