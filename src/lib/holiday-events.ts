/**
 * Curated calendar of holidays, observances, awareness days, pet days, food
 * days, and culturally relevant dates that could inspire a laser-etch
 * concept. Cannabis-adjacent dates (4/20, 7/10, Green Wednesday, etc.) are
 * intentionally prominent given the brand context.
 *
 * Format:
 *   month: 1-12, day: 1-31 (DST-agnostic, calendar-only)
 *   category drives the editorial pill color
 *   suggestions seed the "create concept from this holiday" flow
 */

export type HolidayCategory =
  | 'cannabis'      // The big ones for this brand
  | 'major'         // Christmas, NY, Halloween, etc.
  | 'cultural'      // Diwali, Lunar NY, Cinco de Mayo
  | 'pet'           // Dog day, cat day, etc.
  | 'food'          // Pizza day, donut day
  | 'awareness'     // Mental health, pride
  | 'fun'           // Talk like a pirate, Pi day
  | 'seasonal';     // Solstice, equinox

export interface HolidayEvent {
  id: string;
  name: string;
  month: number; // 1-12
  day: number;   // 1-31
  category: HolidayCategory;
  blurb: string;        // one-line context for the designer
  designIdeas: string[]; // 2-4 short prompts to seed concept creation
  emoji: string;
}

export const HOLIDAY_EVENTS: HolidayEvent[] = [
  // ===== JANUARY =====
  { id: 'new-year', name: "New Year's Day", month: 1, day: 1, category: 'major', emoji: '🎆',
    blurb: 'Fresh start, midnight, fireworks, resolutions.',
    designIdeas: ['Champagne bubbles & confetti', 'Clock striking midnight', 'Fireworks bursting over a city skyline'] },
  { id: 'natl-hugging-day', name: 'National Hugging Day', month: 1, day: 21, category: 'fun', emoji: '🤗',
    blurb: 'Wholesome warmth — could pair well with cozy/winter motifs.',
    designIdeas: ['Two figures embracing in silhouette', 'Heart wrapped in arms'] },
  { id: 'lunar-ny', name: 'Lunar New Year', month: 1, day: 29, category: 'cultural', emoji: '🐉',
    blurb: 'Date varies — currently set to 2026. Dragons, lanterns, prosperity.',
    designIdeas: ['Coiled dragon with cloud motifs', 'Red lantern with calligraphy', 'Koi fish & cherry blossoms'] },

  // ===== FEBRUARY =====
  { id: 'groundhog', name: 'Groundhog Day', month: 2, day: 2, category: 'fun', emoji: '🦫',
    blurb: 'Punxsutawney Phil — folksy, Americana, woodland.',
    designIdeas: ['Groundhog peeking from burrow', 'Woodland scene with shadow play'] },
  { id: 'valentines', name: "Valentine's Day", month: 2, day: 14, category: 'major', emoji: '💘',
    blurb: 'Love, hearts, roses — bestseller potential for couples gifting.',
    designIdeas: ['Anatomical heart with botanical wreath', 'Cupid silhouette with art-nouveau line work', 'Vintage love-letter envelope'] },
  { id: 'mardi-gras', name: 'Mardi Gras', month: 2, day: 17, category: 'cultural', emoji: '🎭',
    blurb: 'Date varies — set to 2026. Masks, beads, jazz, fleur-de-lis.',
    designIdeas: ['Ornate Venetian mask', 'Fleur-de-lis with beaded swags', 'Jazz trumpet w/ banner'] },
  { id: 'love-pet-day', name: 'Love Your Pet Day', month: 2, day: 20, category: 'pet', emoji: '🐾',
    blurb: 'Generic pet appreciation — broad merch appeal.',
    designIdeas: ['Paw print mandala', 'Dog & cat silhouettes intertwined'] },

  // ===== MARCH =====
  { id: 'mardi-grass', name: 'Mardi Grass', month: 3, day: 1, category: 'cannabis', emoji: '🌿',
    blurb: 'Cannabis festival in Nimbin AU. Niche but on-brand.',
    designIdeas: ['Festival banner with cannabis leaf', 'Crowd silhouette w/ smoke trails'] },
  { id: 'pi-day', name: 'Pi Day', month: 3, day: 14, category: 'fun', emoji: '🥧',
    blurb: '3.14 — math nerds, pie shops, geometric appeal.',
    designIdeas: ['π symbol fractured into geometry', 'Spiraling pie slices'] },
  { id: 'st-patricks', name: "St. Patrick's Day", month: 3, day: 17, category: 'major', emoji: '☘️',
    blurb: 'Shamrocks, Celtic knots, green everything.',
    designIdeas: ['Celtic knot weaving into a clover', 'Vintage Irish pub sign aesthetic', 'Leprechaun hat with rainbow line work'] },
  { id: 'spring-equinox', name: 'Spring Equinox', month: 3, day: 20, category: 'seasonal', emoji: '🌱',
    blurb: 'Rebirth, blossoms, bees — strong botanical opportunity.',
    designIdeas: ['Cherry-blossom bough', 'Bee on a sun motif', 'Crocus pushing through snow'] },
  { id: 'puppy-day', name: 'National Puppy Day', month: 3, day: 23, category: 'pet', emoji: '🐶',
    blurb: 'Every dog breed is fair game.',
    designIdeas: ['Puppy portraits in art-nouveau frames', 'Tangled litter of puppies'] },

  // ===== APRIL =====
  { id: 'april-fools', name: "April Fool's Day", month: 4, day: 1, category: 'fun', emoji: '🃏',
    blurb: 'Pranks, jesters, optical illusions.',
    designIdeas: ['Court jester with playing cards', 'Escher-style impossible geometry'] },
  { id: 'easter', name: 'Easter', month: 4, day: 5, category: 'major', emoji: '🐰',
    blurb: 'Date varies — set to 2026. Spring renewal, eggs, pastels.',
    designIdeas: ['Hare with ornamental egg', 'Floral wreath around a cross', 'Fabergé-style decorative egg'] },
  { id: 'earth-day', name: 'Earth Day', month: 4, day: 22, category: 'awareness', emoji: '🌍',
    blurb: 'Sustainability, nature, conservation — natural fit for organic motifs.',
    designIdeas: ['Globe with botanical roots', 'Mountain range with wildlife silhouettes', 'Tree of Life'] },
  { id: 'four-twenty', name: '4/20', month: 4, day: 20, category: 'cannabis', emoji: '🍃',
    blurb: 'THE day. Highest-volume sales of the year — start designing in Feb.',
    designIdeas: ['Detailed cannabis leaf with celestial motifs', 'Smoke curling into a phoenix', 'Bob Marley silhouette w/ leaf halo', '420 numerals built from leaves'] },

  // ===== MAY =====
  { id: 'star-wars', name: 'Star Wars Day', month: 5, day: 4, category: 'fun', emoji: '⚔️',
    blurb: '"May the 4th be with you" — sci-fi licensing aside, spaceship aesthetics work.',
    designIdeas: ['Lightsaber silhouettes crossed', 'Galactic constellation map'] },
  { id: 'cinco-de-mayo', name: 'Cinco de Mayo', month: 5, day: 5, category: 'cultural', emoji: '🇲🇽',
    blurb: 'Mexican heritage — folk-art, sugar skulls, agave.',
    designIdeas: ['Otomi-style folk-art animals', 'Agave plant with hummingbird', 'Talavera tile pattern'] },
  { id: 'mothers-day', name: "Mother's Day", month: 5, day: 10, category: 'major', emoji: '💐',
    blurb: 'Date varies — set to 2026. Florals, hearts, sentimental — strong gift driver.',
    designIdeas: ['Mother & child botanical portrait', 'Bouquet with handwritten "mom"', 'Vintage Victorian flower wreath'] },
  { id: 'memorial-day', name: 'Memorial Day', month: 5, day: 25, category: 'major', emoji: '🇺🇸',
    blurb: 'Date varies — set to 2026 (last Monday of May).',
    designIdeas: ['Folded flag with eagle', 'Poppy field with silhouetted soldier'] },

  // ===== JUNE =====
  { id: 'pride-month', name: 'Pride Month begins', month: 6, day: 1, category: 'awareness', emoji: '🏳️‍🌈',
    blurb: 'Whole month — rainbow, inclusivity, celebration.',
    designIdeas: ['Rainbow blooming as flowers', 'Couple silhouettes with rainbow halo', 'Stonewall riots commemorative'] },
  { id: 'donut-day', name: 'National Donut Day', month: 6, day: 5, category: 'food', emoji: '🍩',
    blurb: 'First Friday of June — set to 2026.',
    designIdeas: ['Stack of donuts with sprinkles flying', 'Donut as a halo'] },
  { id: 'best-friend-day', name: 'National Best Friends Day', month: 6, day: 8, category: 'fun', emoji: '👯',
    blurb: 'Friendship, duos, matching aesthetics.',
    designIdeas: ['Two figures back-to-back', 'Yin-yang of best friends'] },
  { id: 'fathers-day', name: "Father's Day", month: 6, day: 21, category: 'major', emoji: '👔',
    blurb: 'Date varies — 3rd Sunday June, set to 2026. Tools, fishing, tobacco-style aesthetics work well for bongs.',
    designIdeas: ['Vintage tool wall', 'Fishing scene with rod & reel', 'Whiskey & cigar still life'] },
  { id: 'summer-solstice', name: 'Summer Solstice', month: 6, day: 21, category: 'seasonal', emoji: '☀️',
    blurb: 'Longest day, sun worship, festivals.',
    designIdeas: ['Sun with rays interwoven w/ wildflowers', 'Stonehenge silhouette at sunrise'] },

  // ===== JULY =====
  { id: 'canada-day', name: 'Canada Day', month: 7, day: 1, category: 'cultural', emoji: '🇨🇦',
    blurb: 'Maple leaves, mountains, moose.',
    designIdeas: ['Moose silhouette in maple-leaf frame', 'Mountain range w/ northern lights'] },
  { id: 'fourth', name: 'Independence Day', month: 7, day: 4, category: 'major', emoji: '🎇',
    blurb: 'Fireworks, eagles, stars & stripes — huge sales driver.',
    designIdeas: ['Bald eagle with fireworks behind', 'Vintage Americana banner', '13 stars in art-nouveau wreath'] },
  { id: 'oil-day', name: 'Dab Day / 7-10 / Oil Day', month: 7, day: 10, category: 'cannabis', emoji: '💧',
    blurb: '"OIL" upside-down. Concentrate culture day — second-biggest cannabis date after 4/20.',
    designIdeas: ['Honey-amber drop with rosin texture', 'Dab rig silhouette with terpene molecules', 'Oil swirl mandala'] },
  { id: 'world-emoji', name: 'World Emoji Day', month: 7, day: 17, category: 'fun', emoji: '😀',
    blurb: 'Emoji culture — minimal, iconic, fun.',
    designIdeas: ['Emoji grid as a constellation', 'Smiley face hidden in florals'] },
  { id: 'cousins-day', name: 'National Cousins Day', month: 7, day: 24, category: 'fun', emoji: '👨‍👩‍👧‍👦',
    blurb: 'Family — multi-portrait designs.',
    designIdeas: ['Group silhouette portrait'] },

  // ===== AUGUST =====
  { id: 'mountain-day', name: 'World Lion Day', month: 8, day: 10, category: 'awareness', emoji: '🦁',
    blurb: 'Conservation — bold animal portraits sell.',
    designIdeas: ['Lion in art-nouveau medallion', 'Lion mane interwoven with savanna grass'] },
  { id: 'leftie-day', name: 'International Lefthanders Day', month: 8, day: 13, category: 'fun', emoji: '✋',
    blurb: '10% of population — niche but loyal market.',
    designIdeas: ['Hand silhouette w/ fingerprint detail'] },
  { id: 'dog-day', name: 'National Dog Day', month: 8, day: 26, category: 'pet', emoji: '🐕',
    blurb: 'Massive pet-merch driver. Customizable per breed.',
    designIdeas: ['Dog portrait with botanical halo', 'Loyal-companion silhouette by a hearth', 'Pack of breed silhouettes in a row'] },

  // ===== SEPTEMBER =====
  { id: 'labor-day', name: 'Labor Day', month: 9, day: 7, category: 'major', emoji: '🛠️',
    blurb: 'Date varies — 1st Monday Sept, set to 2026. Working class, tools, end of summer.',
    designIdeas: ['Union banner w/ wrench & hammer', 'Lunchpail still-life'] },
  { id: 'grandparents-day', name: 'Grandparents Day', month: 9, day: 13, category: 'fun', emoji: '👴',
    blurb: 'Date varies — Sunday after Labor Day.',
    designIdeas: ['Vintage portrait frame', 'Hands holding hands across generations'] },
  { id: 'guac-day', name: 'National Guacamole Day', month: 9, day: 16, category: 'food', emoji: '🥑',
    blurb: 'Avocado culture is real.',
    designIdeas: ['Avocado halved with botanical leaves', 'Guac bowl still life'] },
  { id: 'pirate-day', name: 'Talk Like a Pirate Day', month: 9, day: 19, category: 'fun', emoji: '🏴‍☠️',
    blurb: 'Goofy but iconic — skulls & crossbones perform well.',
    designIdeas: ['Skull & crossbones with treasure-map ornament', 'Pirate ship sailing through smoke'] },
  { id: 'autumn-equinox', name: 'Autumn Equinox', month: 9, day: 22, category: 'seasonal', emoji: '🍁',
    blurb: 'Foliage, harvest, balance.',
    designIdeas: ['Maple leaf with intricate vein detail', 'Harvest cornucopia'] },

  // ===== OCTOBER =====
  { id: 'taco-day', name: 'National Taco Day', month: 10, day: 4, category: 'food', emoji: '🌮',
    blurb: 'Folksy and fun.',
    designIdeas: ['Taco with sombrero & maracas', 'Geometric taco still-life'] },
  { id: 'cat-day', name: 'National Cat Day', month: 10, day: 29, category: 'pet', emoji: '🐈',
    blurb: 'Cat people are devoted. Mystical motifs play well.',
    designIdeas: ['Black cat with crescent moon', 'Egyptian Bastet with art-nouveau ornament', 'Cat curled into a yin-yang'] },
  { id: 'halloween', name: 'Halloween', month: 10, day: 31, category: 'major', emoji: '🎃',
    blurb: 'Top 3 sales date for spooky/dark aesthetics. Start designing in August.',
    designIdeas: ['Jack-o-lantern with intricate carving', 'Witch silhouette w/ smoke serpents', 'Skull bouquet of dead roses', 'Haunted Victorian house', 'Ouija board pattern'] },

  // ===== NOVEMBER =====
  { id: 'dotd', name: 'Día de los Muertos', month: 11, day: 2, category: 'cultural', emoji: '💀',
    blurb: 'Sugar skulls, marigolds, papel picado — gorgeous laser-etch fit.',
    designIdeas: ['Ornate sugar skull with marigolds', 'Papel-picado banner with floral skulls', 'Catrina portrait'] },
  { id: 'veterans-day', name: 'Veterans Day', month: 11, day: 11, category: 'major', emoji: '🎖️',
    blurb: 'Patriotic, somber, eagle/flag motifs.',
    designIdeas: ['Eagle with folded flag', 'Poppy memorial wreath'] },
  { id: 'pup-day', name: 'National Take Your Cat to the Vet Day', month: 11, day: 7, category: 'pet', emoji: '🩺',
    blurb: 'Niche but adorable.',
    designIdeas: ['Cat in a tiny stethoscope'] },
  { id: 'thanksgiving', name: 'Thanksgiving', month: 11, day: 26, category: 'major', emoji: '🦃',
    blurb: 'Date varies — 4th Thursday Nov, set to 2026. Harvest, gratitude, family.',
    designIdeas: ['Turkey in art-nouveau frame', 'Cornucopia of botanicals', 'Pumpkin pie still life'] },
  { id: 'green-wednesday', name: 'Green Wednesday', month: 11, day: 25, category: 'cannabis', emoji: '🟢',
    blurb: 'Day before Thanksgiving — biggest cannabis sales day of Q4.',
    designIdeas: ['Cannabis cornucopia', 'Family gathering w/ smoke wreath'] },
  { id: 'black-friday', name: 'Black Friday', month: 11, day: 27, category: 'major', emoji: '🛍️',
    blurb: 'Date varies — Friday after Thanksgiving. Drive holiday limited editions.',
    designIdeas: ['Bold typographic SALE motif', 'Shopping bags as gift wrap'] },

  // ===== DECEMBER =====
  { id: 'pearl-harbor', name: 'Pearl Harbor Remembrance Day', month: 12, day: 7, category: 'awareness', emoji: '⚓',
    blurb: 'Solemn, naval motifs.',
    designIdeas: ['Naval anchor with poppy wreath'] },
  { id: 'hanukkah', name: 'Hanukkah begins', month: 12, day: 14, category: 'cultural', emoji: '🕎',
    blurb: 'Date varies — set to 2026. Menorah, dreidel, blue & gold.',
    designIdeas: ['Menorah with flames as flowers', 'Dreidel with Hebrew letters in ornament'] },
  { id: 'winter-solstice', name: 'Winter Solstice / Yule', month: 12, day: 21, category: 'seasonal', emoji: '❄️',
    blurb: 'Longest night — pagan roots, evergreens, candles.',
    designIdeas: ['Evergreen wreath with candle', 'Stag silhouette with antler-tree motif'] },
  { id: 'festivus', name: 'Festivus', month: 12, day: 23, category: 'fun', emoji: '🎄',
    blurb: 'For the rest of us. Aluminum pole, airing of grievances.',
    designIdeas: ['Stark aluminum pole as minimalist art'] },
  { id: 'christmas-eve', name: 'Christmas Eve', month: 12, day: 24, category: 'major', emoji: '🌟',
    blurb: 'Anticipation, snow, fireplace — atmospheric.',
    designIdeas: ['Fireplace stocking still life'] },
  { id: 'christmas', name: 'Christmas', month: 12, day: 25, category: 'major', emoji: '🎄',
    blurb: 'Top sales date. Plan limited editions in October.',
    designIdeas: ['Ornate snowflake mandala', 'Reindeer with antler-galaxy', 'Christmas tree with ornament details', 'Vintage Krampus illustration', 'Nativity silhouette'] },
  { id: 'kwanzaa', name: 'Kwanzaa begins', month: 12, day: 26, category: 'cultural', emoji: '🕯️',
    blurb: 'Pan-African celebration through Jan 1.',
    designIdeas: ['Kinara with seven flames', 'Adinkra symbol wreath'] },
  { id: 'nye', name: "New Year's Eve", month: 12, day: 31, category: 'major', emoji: '🥂',
    blurb: 'Champagne, midnight, retrospection.',
    designIdeas: ['Hourglass with flowing sand', 'Disco ball with starburst rays'] },
];

/* ───────────── helpers ───────────── */

const MS_PER_DAY = 86_400_000;

/**
 * Returns the next chronological occurrence of the event from `from` (default
 * = today). If the event already passed this year, returns next year's date.
 */
export function nextOccurrence(event: HolidayEvent, from = new Date()): Date {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let candidate = new Date(today.getFullYear(), event.month - 1, event.day);
  if (candidate.getTime() < today.getTime()) {
    candidate = new Date(today.getFullYear() + 1, event.month - 1, event.day);
  }
  return candidate;
}

export function daysUntil(event: HolidayEvent, from = new Date()): number {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const next = nextOccurrence(event, from);
  return Math.round((next.getTime() - today.getTime()) / MS_PER_DAY);
}

/**
 * Events upcoming within `withinDays` (inclusive). Sorted ascending by date.
 */
export function upcomingEvents(withinDays = 21, from = new Date()): HolidayEvent[] {
  return HOLIDAY_EVENTS
    .map((e) => ({ event: e, days: daysUntil(e, from) }))
    .filter((x) => x.days <= withinDays)
    .sort((a, b) => a.days - b.days)
    .map((x) => x.event);
}

/**
 * All events sorted by next-occurrence ascending — gives a rolling-year view
 * starting from today.
 */
export function eventsRollingYear(from = new Date()): HolidayEvent[] {
  return [...HOLIDAY_EVENTS].sort(
    (a, b) => daysUntil(a, from) - daysUntil(b, from)
  );
}

export const CATEGORY_META: Record<HolidayCategory, { label: string; cls: string }> = {
  cannabis:  { label: 'Cannabis',  cls: 'st-approved' },
  major:     { label: 'Major',     cls: 'st-review' },
  cultural:  { label: 'Cultural',  cls: 'st-ideation' },
  pet:       { label: 'Pet',       cls: 'st-mfg' },
  food:      { label: 'Food',      cls: 'st-review' },
  awareness: { label: 'Awareness', cls: 'st-ready' },
  fun:       { label: 'Fun',       cls: 'st-archived' },
  seasonal:  { label: 'Seasonal',  cls: 'st-mfg' },
};
