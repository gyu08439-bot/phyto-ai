export const ONBOARDING_QUESTIONS = [
  {
    isPlant: true,
    id: "plant_count",
    title: "How many plants are in your home?",
    subtitle: "Flora AI tailors care alerts and watering calendars to your collection size.",
    options: [
      { label: "1 to 3 Plants", desc: "Just starting my botanical space", icon: "🌱" },
      { label: "4 to 9 Plants", desc: "Expanding indoor urban jungle", icon: "🪴" },
      { label: "10+ Plants", desc: "Passionate plant collector & enthusiast", icon: "🌿" }
    ]
  },
  {
    isPlant: true,
    id: "experience",
    title: "What is your gardening experience?",
    subtitle: "We adjust diagnosis depth and biological terminology to match your level.",
    options: [
      { label: "Total Beginner", desc: "Plants often dry out or turn yellow unexpectedly", icon: "🔰" },
      { label: "Intermediate", desc: "Know the basics of repotting & watering cycles", icon: "🧤" },
      { label: "Green Thumb", desc: "Propagating, mixing custom substrates & soil", icon: "🏆" }
    ]
  },
  {
    isPlant: true,
    id: "urgency",
    title: "Is any plant suffering right now?",
    subtitle: "Our Computer Vision model prioritizes acute pathogen & root infections.",
    options: [
      { label: "Yes, Leaves Are Yellowing", desc: "Chlorosis, brown spots, or leaf dropping", icon: "🍂" },
      { label: "Possible Insect Pest", desc: "Spider mites, fungus gnats, or mealybugs", icon: "🐛" },
      { label: "No, Just Routine Care", desc: "Optimizing watering schedules and Lux light", icon: "✨" }
    ]
  },
  {
    isPlant: true,
    id: "pets",
    title: "Do you have pets at home?",
    subtitle: "Over 40% of houseplants contain calcium oxalate or toxins harmful to cats & dogs.",
    options: [
      { label: "Yes, Cats or Dogs", desc: "Mandatory Pet-Toxicity filter & emergency alerts", icon: "🐾" },
      { label: "No Pets", desc: "Full botanical database without pet restrictions", icon: "🏡" }
    ]
  }
];

export const PLANT_DATABASE = [
  {
    isPlant: true,
    id: "monstera",
    commonName: "Monstera Deliciosa",
    botanicalName: "Monstera deliciosa",
    category: "Aroids",
    defaultHealth: 72,
    condition: "Early Leaf Rust (Puccinia)",
    severity: "Moderate",
    icon: "🪴",
    image: "assets/plants/monstera.jpg",
    cause: "High localized foliage moisture combined with stagnant indoor air circulation favored fungal spore propagation.",
    rx: [
      { step: "Prune Infected Foliage", action: "Sterilize shears with 70% alcohol and prune the two most damaged lower leaves." },
      { step: "Copper Fungicide Treatment", action: "Apply copper soap antifungal foliar spray evenly once weekly for 3 weeks." },
      { step: "Substrate Moisture Adjustment", action: "Allow top 2.5 inches of chunky soil mix to dry before watering." }
    ],
    petToxicity: { isToxic: true, notes: "Contains insoluble calcium oxalates. Causes oral irritation and vomiting in cats and dogs." },
    wateringInterval: 8,
    lightRequirement: "Bright Indirect (2,500 - 4,500 Lux)",
    careLevel: "Easy",
    description: "Iconic tropical plant with fenestrated leaves. Extremely resilient, prefers high humidity and chunky airy substrate."
  },
  {
    isPlant: true,
    id: "ficus_elastica",
    commonName: "Rubber Tree",
    botanicalName: "Ficus elastica 'Burgundy'",
    category: "Ficus",
    defaultHealth: 64,
    condition: "Chlorosis & Iron Deficiency",
    severity: "Mild",
    icon: "🌳",
    image: "assets/plants/ficus_elastica.jpg",
    cause: "Alkaline tap water raised substrate pH above 7.0, locking micronutrient absorption in active leaf veins.",
    rx: [
      { step: "Acidify & Flush Substrate", action: "Flush potting mix with filtered water acidified with lemon drops to pH 6.0." },
      { step: "Foliar Micronutrient Feed", action: "Spray foliage with chelated iron (EDDHA) once every 10 days." },
      { step: "Increase Lux Photoperiod", action: "Move 1 meter closer to an East-facing window (minimum 3,000 Lux)." }
    ],
    petToxicity: { isToxic: true, notes: "Ficus sap contains ficin and psoralen, irritating to pet digestive tracts." },
    wateringInterval: 10,
    lightRequirement: "Bright Indirect (3,000 - 6,000 Lux)",
    careLevel: "Medium",
    description: "Stately plant with thick, glossy leathery dark burgundy foliage. Thrives in stable warmth."
  },
  {
    isPlant: true,
    id: "snake_plant",
    commonName: "Snake Plant",
    botanicalName: "Dracaena trifasciata",
    category: "Succulents",
    defaultHealth: 91,
    condition: "Mild Edema (Over-Hydration)",
    severity: "Low",
    icon: "🗡️",
    image: "assets/plants/snake_plant.jpg",
    cause: "Cells took up water faster than transpiration rate due to cold indoor temperatures during the night.",
    rx: [
      { step: "Cease Irrigation for 14 Days", action: "Allow root ball to become bone-dry throughout the entire pot depth." },
      { step: "Ensure Free Drainage", action: "Verify nursery pot drain holes are not obstructed by mineral buildup." },
      { step: "Maintain Warmth (>18°C)", action: "Keep pot elevated from freezing floorboards or windowsill drafts." }
    ],
    petToxicity: { isToxic: true, notes: "Contains saponins that can induce gastrointestinal nausea in pets." },
    wateringInterval: 18,
    lightRequirement: "Low to Bright (500 - 4,000 Lux)",
    careLevel: "Very Easy",
    description: "Nearly indestructible air-purifier. Tolerates deep shade, drought, and neglected watering."
  },
  {
    isPlant: true,
    id: "calathea_orbifolia",
    commonName: "Calathea Orbifolia",
    botanicalName: "Goeppertia orbifolia",
    category: "Marantaceae",
    defaultHealth: 58,
    condition: "Spider Mite Infestation (Tetranychidae)",
    severity: "High",
    icon: "🌿",
    image: "assets/plants/calathea_orbifolia.jpg",
    cause: "Dry winter indoor air (relative humidity below 35%) triggered exponential two-spotted spider mite colony reproduction.",
    rx: [
      { step: "Immediate Lukewarm Shower", action: "Rinse undersides of all foliage with 22°C shower spray to dislodge webs." },
      { step: "Cold-Pressed Neem Oil Spray", action: "Treat stems and foliage with emulsified cold-pressed neem oil at dusk." },
      { step: "Elevate Humidity (>60%)", action: "Place ultrasonic humidifier within 1.5 meters of the prayer plant." }
    ],
    petToxicity: { isToxic: false, notes: "100% Pet-Safe! Non-toxic to cats, dogs, and birds." },
    wateringInterval: 6,
    lightRequirement: "Medium Filtered (1,200 - 2,500 Lux)",
    careLevel: "Advanced",
    description: "Stunning round silver-striped leaves. Requires pure distilled/rainwater and high ambient humidity."
  },
  {
    isPlant: true,
    id: "zz_plant",
    commonName: "ZZ Plant",
    botanicalName: "Zamioculcas zamiifolia",
    category: "Aroids",
    defaultHealth: 95,
    condition: "Vigorous Prime Growth",
    severity: "None",
    icon: "🌱",
    image: "assets/plants/zz_plant.jpg",
    cause: "Optimal drought-stress balance mimicking native Eastern African seasonal climate.",
    rx: [
      { step: "Maintain Dry Cycle", action: "Water only when rhizome storage tubers have absorbed available moisture." },
      { step: "Rotate 90 Degrees", action: "Turn pot bi-weekly to prevent phototropic lean towards window." }
    ],
    petToxicity: { isToxic: true, notes: "Calcium oxalate crystals; toxic if masticated by animals." },
    wateringInterval: 21,
    lightRequirement: "Deep Shade to Medium (300 - 2,000 Lux)",
    careLevel: "Very Easy",
    description: "Thick waxy leaves sprouting from potato-like subterranean rhizomes. Thrives in dimly lit offices."
  },
  {
    isPlant: true,
    id: "pothos_golden",
    commonName: "Golden Pothos",
    botanicalName: "Epipremnum aureum",
    category: "Aroids",
    defaultHealth: 88,
    condition: "Healthy Trailing State",
    severity: "None",
    icon: "🍃",
    image: "assets/plants/pothos_golden.jpg",
    cause: "Consistent moisture and indirect light.",
    rx: [
      { step: "Prune Vine Tips", action: "Snip leggy vine ends to stimulate bushy node branching." },
      { step: "Dust Leaves", action: "Wipe leaves with damp microfibre cloth to maximize photosynthetic efficiency." }
    ],
    petToxicity: { isToxic: true, notes: "Toxic to cats and dogs due to insoluble oxalates." },
    wateringInterval: 7,
    lightRequirement: "Low to Bright Indirect (800 - 3,500 Lux)",
    careLevel: "Very Easy",
    description: "Fast-growing cascading trailing vine with heart-shaped golden variegated foliage."
  },
  {
    isPlant: true,
    id: "boston_fern",
    commonName: "Boston Fern",
    botanicalName: "Nephrolepis exaltata",
    category: "Ferns",
    defaultHealth: 82,
    condition: "Crispy Frond Margins",
    severity: "Low",
    icon: "🌿",
    image: "assets/plants/boston_fern.jpg",
    cause: "Low ambient humidity and direct afternoon sunlight scorching delicate pinnae.",
    rx: [
      { step: "Trim Brown Fronds", action: "Snip completely dried fronds at the soil crown." },
      { step: "Pebble Tray Humidity", action: "Set pot on pebble tray filled with water to elevate local vapor pressure." }
    ],
    petToxicity: { isToxic: false, notes: "Completely Non-Toxic & 100% Pet-Safe!" },
    wateringInterval: 5,
    lightRequirement: "Medium Filtered (1,000 - 2,200 Lux)",
    careLevel: "Medium",
    description: "Lush arching fronds. Outstanding natural humidifying and pet-safe decorative fern."
  },
  {
    isPlant: true,
    id: "spider_plant",
    commonName: "Spider Plant",
    botanicalName: "Chlorophytum comosum",
    category: "Asparagaceae",
    defaultHealth: 90,
    condition: "Flourishing with Plantlets",
    severity: "None",
    icon: "🌾",
    image: "assets/plants/spider_plant.jpg",
    cause: "Balanced root-bound environment encouraging stolon flower shoots.",
    rx: [
      { step: "Propagate Spiderettes", action: "Cut mature baby plantlets with aerial roots and root in clean water." },
      { step: "Filtered Water Only", action: "Use rainwater or RO water to prevent fluoride leaf tip burn." }
    ],
    petToxicity: { isToxic: false, notes: "Non-toxic & Pet Safe! Has mild calming effect on felines." },
    wateringInterval: 7,
    lightRequirement: "Bright Indirect (2,000 - 4,500 Lux)",
    careLevel: "Very Easy",
    description: "Air-purifying champion with cascading baby plantlets. Safe for curious cats and puppies."
  },
  {
    isPlant: true,
    id: "peace_lily",
    commonName: "Peace Lily",
    botanicalName: "Spathiphyllum wallisii",
    category: "Aroids",
    defaultHealth: 76,
    condition: "Drooping & Dehydration",
    severity: "Mild",
    icon: "🕊️",
    image: "assets/plants/peace_lily.jpg",
    cause: "Root transpiration exceeded available substrate moisture, causing loss of turgor pressure.",
    rx: [
      { step: "Bottom Soak 20 Min", action: "Place pot in basin of room-temperature water for 20 minutes to re-hydrate." },
      { step: "Diffuse Light Only", action: "Keep out of direct sunlight to protect delicate white spathe blooms." }
    ],
    petToxicity: { isToxic: true, notes: "Contains insoluble calcium oxalates; irritates mouth and lips." },
    wateringInterval: 6,
    lightRequirement: "Low to Medium (600 - 2,000 Lux)",
    careLevel: "Easy",
    description: "Dramatic communicative plant that wilts visibly when thirsty and recovers within hours of watering."
  },
  {
    isPlant: true,
    id: "money_tree",
    commonName: "Money Tree",
    botanicalName: "Pachira aquatica",
    category: "Malvaceae",
    defaultHealth: 85,
    condition: "Healthy Braided Canopy",
    severity: "None",
    icon: "🌴",
    image: "assets/plants/money_tree.jpg",
    cause: "Stable indirect light and moderate deep watering cadence.",
    rx: [
      { step: "Check Trunk Tape", action: "Verify nursery rubber bands or tape under soil are removed so trunks don't strangle." },
      { step: "Deep Monthly Drench", action: "Water until drainage flows freely, then empty saucer completely." }
    ],
    petToxicity: { isToxic: false, notes: "100% Non-Toxic & Pet-Friendly!" },
    wateringInterval: 9,
    lightRequirement: "Medium to Bright Indirect (1,800 - 4,000 Lux)",
    careLevel: "Easy",
    description: "Braided ornamental trunk with vibrant palmate green leaves. Symbol of prosperity and clean air."
  },
  {
    isPlant: true,
    id: "bromeliad",
    commonName: "Bromeliad",
    botanicalName: "Guzmania lingulata",
    category: "Bromeliaceae",
    defaultHealth: 94,
    condition: "Prime Tropical Bloom",
    severity: "None",
    icon: "🌺",
    image: "assets/plants/bromeliad.jpg",
    cause: "Consistent central rosette hydration and warm indirect ambient light.",
    rx: [
      { step: "Central Rosette Hydration", action: "Fill the central cup with filtered room-temperature water weekly." },
      { step: "Flush Rosette Monthly", action: "Rinse central cup with fresh water to prevent salt and algae buildup." }
    ],
    petToxicity: { isToxic: false, notes: "100% Non-Toxic & Pet-Safe for cats and dogs!" },
    wateringInterval: 7,
    lightRequirement: "Medium to Bright Indirect (1,500 - 3,500 Lux)",
    careLevel: "Easy",
    description: "Vibrant exotic rosette flower with architectural foliage. Resilient, safe for pets and easy to maintain."
  }
];
