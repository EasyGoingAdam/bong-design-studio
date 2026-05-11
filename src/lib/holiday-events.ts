/**
 * Curated calendar of ~120 holidays, observances, awareness days, pet days,
 * food days, cannabis-relevant dates, and obscure days that could inspire
 * a laser-etch concept.
 *
 * Each event is either:
 *   - "fixed": same calendar day every year — month + day
 *   - "floating": computed per-year via id → lib/holiday-dates.ts
 */

import { computeFloatingDate } from './holiday-dates';

export type HolidayCategory =
  | 'cannabis'
  | 'major'
  | 'cultural'
  | 'pet'
  | 'food'
  | 'awareness'
  | 'fun'
  | 'seasonal'
  | 'music';

export interface HolidayEvent {
  id: string;
  name: string;
  /**
   * Fixed events use month/day. Floating events use { floating: true }
   * and look up the year-specific date via computeFloatingDate(id, year).
   */
  month?: number; // 1-12 (for fixed events)
  day?: number;   // 1-31 (for fixed events)
  floating?: boolean;
  category: HolidayCategory;
  blurb: string;
  designIdeas: string[];
  emoji: string;
}

/* ────────────────────────────────────────────────────────────────────
 * Event database
 * ──────────────────────────────────────────────────────────────────── */

export const HOLIDAY_EVENTS: HolidayEvent[] = [
  /* ===== JANUARY ===== */
  { id: 'new-year', name: "New Year's Day", month: 1, day: 1, category: 'major', emoji: '🎆',
    blurb: 'Fresh start, midnight, fireworks, resolutions.',
    designIdeas: ['Champagne bubbles & confetti', 'Clock striking midnight', 'Fireworks bursting over a city skyline'] },
  { id: 'mlk-day', name: 'Martin Luther King Jr. Day', floating: true, category: 'awareness', emoji: '✊🏾',
    blurb: '3rd Monday of January. Civil rights, dignity, "I Have a Dream".',
    designIdeas: ['Portrait silhouette w/ "Dream" calligraphy', 'Interlocking-hands motif'] },
  { id: 'natl-hugging-day', name: 'National Hugging Day', month: 1, day: 21, category: 'fun', emoji: '🤗',
    blurb: 'Wholesome warmth — pairs well with cozy/winter motifs.',
    designIdeas: ['Two figures embracing in silhouette', 'Heart wrapped in arms'] },
  { id: 'opposite-day', name: 'National Opposite Day', month: 1, day: 25, category: 'fun', emoji: '↺',
    blurb: 'Bring negatives → positives. Inverse / chiaroscuro plays well.',
    designIdeas: ['Inverted yin-yang', 'Mirrored composition'] },
  { id: 'lunar-ny', name: 'Lunar New Year', floating: true, category: 'cultural', emoji: '🐉',
    blurb: 'Dragons, lanterns, prosperity. Date varies — lookup table covers 2024-2032.',
    designIdeas: ['Coiled dragon with cloud motifs', 'Red lantern with calligraphy', 'Koi fish & cherry blossoms'] },

  /* ===== FEBRUARY ===== */
  { id: 'groundhog', name: 'Groundhog Day', month: 2, day: 2, category: 'fun', emoji: '🦫',
    blurb: 'Punxsutawney Phil — folksy, Americana, woodland.',
    designIdeas: ['Groundhog peeking from burrow', 'Woodland scene with shadow play'] },
  { id: 'pizza-day', name: 'National Pizza Day', month: 2, day: 9, category: 'food', emoji: '🍕',
    blurb: 'Universal appeal, geometric (slice composition).',
    designIdeas: ['Slice with mandala toppings', 'Hand-pull cheese stretch'] },
  { id: 'valentines', name: "Valentine's Day", month: 2, day: 14, category: 'major', emoji: '💘',
    blurb: 'Love, hearts, roses — bestseller for couples gifting.',
    designIdeas: ['Anatomical heart with botanical wreath', 'Cupid silhouette w/ art-nouveau line work', 'Vintage love-letter envelope'] },
  { id: 'presidents-day', name: "Presidents' Day", floating: true, category: 'major', emoji: '🏛️',
    blurb: '3rd Monday Feb — Lincoln, Washington, Americana.',
    designIdeas: ['Lincoln silhouette w/ flag', 'Mt. Rushmore line illustration'] },
  { id: 'love-pet-day', name: 'Love Your Pet Day', month: 2, day: 20, category: 'pet', emoji: '🐾',
    blurb: 'Generic pet appreciation — broad merch appeal.',
    designIdeas: ['Paw print mandala', 'Dog & cat silhouettes intertwined'] },
  { id: 'tooth-fairy', name: 'National Tooth Fairy Day', month: 2, day: 28, category: 'fun', emoji: '🦷',
    blurb: 'Whimsical, fairy-tale aesthetic.',
    designIdeas: ['Fairy with tooth and moon'] },

  /* ===== MARCH ===== */
  { id: 'mardi-grass', name: 'Mardi Grass', month: 3, day: 1, category: 'cannabis', emoji: '🌿',
    blurb: 'Cannabis festival in Nimbin AU. Niche but on-brand.',
    designIdeas: ['Festival banner with cannabis leaf', 'Crowd silhouette w/ smoke trails'] },
  { id: 'mardi-gras', name: 'Mardi Gras', floating: true, category: 'cultural', emoji: '🎭',
    blurb: '47 days before Easter. Masks, beads, jazz, fleur-de-lis.',
    designIdeas: ['Ornate Venetian mask', 'Fleur-de-lis with beaded swags', 'Jazz trumpet w/ banner'] },
  { id: 'ash-wednesday', name: 'Ash Wednesday', floating: true, category: 'cultural', emoji: '✝️',
    blurb: 'Start of Lent. Solemn, ash-cross symbolism.',
    designIdeas: ['Cross with ash texture'] },
  { id: 'pi-day', name: 'Pi Day', month: 3, day: 14, category: 'fun', emoji: '🥧',
    blurb: '3.14 — math nerds, pie shops, geometric appeal.',
    designIdeas: ['π symbol fractured into geometry', 'Spiraling pie slices'] },
  { id: 'st-patricks', name: "St. Patrick's Day", month: 3, day: 17, category: 'major', emoji: '☘️',
    blurb: 'Shamrocks, Celtic knots, green everything.',
    designIdeas: ['Celtic knot weaving into a clover', 'Vintage Irish pub sign aesthetic', 'Leprechaun hat with rainbow line work'] },
  { id: 'spring-equinox', name: 'Spring Equinox / Ostara', month: 3, day: 20, category: 'seasonal', emoji: '🌱',
    blurb: 'Rebirth, blossoms, bees — strong botanical opportunity.',
    designIdeas: ['Cherry-blossom bough', 'Bee on a sun motif', 'Crocus pushing through snow'] },
  { id: 'holi', name: 'Holi', floating: true, category: 'cultural', emoji: '🎨',
    blurb: 'Festival of colors — bursts of pigment, joy.',
    designIdeas: ['Powder explosion silhouette', 'Color-cloud mandala'] },
  { id: 'puppy-day', name: 'National Puppy Day', month: 3, day: 23, category: 'pet', emoji: '🐶',
    blurb: 'Every dog breed is fair game.',
    designIdeas: ['Puppy portraits in art-nouveau frames', 'Tangled litter of puppies'] },
  { id: 'world-poetry-day', name: 'World Poetry Day', month: 3, day: 21, category: 'awareness', emoji: '✒️',
    blurb: 'Type-driven designs play strong.',
    designIdeas: ['Quill with ink scrolls', 'Verse in art-nouveau cartouche'] },
  { id: 'palm-sunday', name: 'Palm Sunday', floating: true, category: 'cultural', emoji: '🌿',
    blurb: 'Week before Easter. Palm fronds, donkey procession.',
    designIdeas: ['Palm-frond fan'] },

  /* ===== APRIL ===== */
  { id: 'april-fools', name: "April Fool's Day", month: 4, day: 1, category: 'fun', emoji: '🃏',
    blurb: 'Pranks, jesters, optical illusions.',
    designIdeas: ['Court jester with playing cards', 'Escher-style impossible geometry'] },
  { id: 'good-friday', name: 'Good Friday', floating: true, category: 'cultural', emoji: '✝️',
    blurb: '2 days before Easter. Crucifixion, solemn.',
    designIdeas: ['Stylized cross with crown of thorns'] },
  { id: 'easter', name: 'Easter', floating: true, category: 'major', emoji: '🐰',
    blurb: 'Spring renewal, eggs, pastels. Date floats — computed via Computus algorithm.',
    designIdeas: ['Hare with ornamental egg', 'Floral wreath around a cross', 'Fabergé-style decorative egg'] },
  { id: 'earth-day', name: 'Earth Day', month: 4, day: 22, category: 'awareness', emoji: '🌍',
    blurb: 'Sustainability, nature, conservation — natural fit for organic motifs.',
    designIdeas: ['Globe with botanical roots', 'Mountain range with wildlife silhouettes', 'Tree of Life'] },
  { id: 'four-twenty', name: '4/20', month: 4, day: 20, category: 'cannabis', emoji: '🍃',
    blurb: 'THE day. Highest-volume sales of the year — start designing in Feb.',
    designIdeas: ['Detailed cannabis leaf with celestial motifs', 'Smoke curling into a phoenix', 'Bob Marley silhouette w/ leaf halo', '420 numerals built from leaves'] },
  { id: 'arbor-day', name: 'Arbor Day', month: 4, day: 26, category: 'awareness', emoji: '🌳',
    blurb: 'Last Friday Apr (US) — but most use Apr 26. Trees, forestry.',
    designIdeas: ['Cross-section of tree rings', 'Tree silhouette w/ root system'] },
  { id: 'ramadan', name: 'Ramadan begins', floating: true, category: 'cultural', emoji: '🌙',
    blurb: 'Month of fasting. Crescent moon, Islamic geometric art.',
    designIdeas: ['Crescent moon with star', 'Geometric Arabesque pattern'] },

  /* ===== MAY ===== */
  { id: 'may-day', name: 'May Day', month: 5, day: 1, category: 'seasonal', emoji: '🌷',
    blurb: 'Maypole, spring flowers, workers.',
    designIdeas: ['Maypole with ribbons', 'Flower-crown silhouette'] },
  { id: 'star-wars', name: 'Star Wars Day', month: 5, day: 4, category: 'fun', emoji: '⚔️',
    blurb: '"May the 4th be with you" — sci-fi licensing aside, spaceship aesthetics work.',
    designIdeas: ['Lightsaber silhouettes crossed', 'Galactic constellation map'] },
  { id: 'revenge-of-fifth', name: 'Revenge of the Fifth', month: 5, day: 5, category: 'fun', emoji: '☠️',
    blurb: 'Dark-side counterpart to Star Wars Day. Skulls, helmets.',
    designIdeas: ['Vader-style helmet silhouette'] },
  { id: 'cinco-de-mayo', name: 'Cinco de Mayo', month: 5, day: 5, category: 'cultural', emoji: '🇲🇽',
    blurb: 'Mexican heritage — folk-art, sugar skulls, agave.',
    designIdeas: ['Otomi-style folk-art animals', 'Agave plant with hummingbird', 'Talavera tile pattern'] },
  { id: 'teacher-day', name: 'Teacher Appreciation Day', month: 5, day: 6, category: 'awareness', emoji: '🍎',
    blurb: 'Apples, books, chalkboards.',
    designIdeas: ['Apple with botanical stem'] },
  { id: 'mothers-day', name: "Mother's Day", floating: true, category: 'major', emoji: '💐',
    blurb: '2nd Sunday May. Florals, hearts, sentimental — strong gift driver.',
    designIdeas: ['Mother & child botanical portrait', 'Bouquet with handwritten "mom"', 'Vintage Victorian flower wreath'] },
  { id: 'limerick-day', name: 'Limerick Day', month: 5, day: 12, category: 'fun', emoji: '📜',
    blurb: 'Niche, but wordplay & calligraphy potential.',
    designIdeas: [] },
  { id: 'syttende-mai', name: 'Norwegian Constitution Day', month: 5, day: 17, category: 'cultural', emoji: '🇳🇴',
    blurb: 'Norse motifs — runes, longships, fjords.',
    designIdeas: ['Viking longship with rune border'] },
  { id: 'memorial-day', name: 'Memorial Day', floating: true, category: 'major', emoji: '🇺🇸',
    blurb: 'Last Mon May. Patriotic, somber.',
    designIdeas: ['Folded flag with eagle', 'Poppy field with silhouetted soldier'] },
  { id: 'world-bee-day', name: 'World Bee Day', month: 5, day: 20, category: 'awareness', emoji: '🐝',
    blurb: 'Strong botanical/insect art opportunity.',
    designIdeas: ['Honeycomb with bee in flight', 'Geometric hexagon pattern'] },

  /* ===== JUNE ===== */
  { id: 'pride-month', name: 'Pride Month begins', month: 6, day: 1, category: 'awareness', emoji: '🏳️‍🌈',
    blurb: 'Whole month — rainbow, inclusivity, celebration.',
    designIdeas: ['Rainbow blooming as flowers', 'Couple silhouettes with rainbow halo', 'Stonewall riots commemorative'] },
  { id: 'donut-day', name: 'National Donut Day', floating: true, category: 'food', emoji: '🍩',
    blurb: 'First Friday of June.',
    designIdeas: ['Stack of donuts with sprinkles flying', 'Donut as a halo'] },
  { id: 'world-environment-day', name: 'World Environment Day', month: 6, day: 5, category: 'awareness', emoji: '🌎',
    blurb: 'Sustainability — natural fit for organic motifs.',
    designIdeas: ['Leaf veins forming planet'] },
  { id: 'best-friend-day', name: 'National Best Friends Day', month: 6, day: 8, category: 'fun', emoji: '👯',
    blurb: 'Friendship, duos, matching aesthetics.',
    designIdeas: ['Two figures back-to-back', 'Yin-yang of best friends'] },
  { id: 'flag-day', name: 'Flag Day', month: 6, day: 14, category: 'major', emoji: '🇺🇸',
    blurb: 'Americana, stars and stripes.',
    designIdeas: ['Vintage flag w/ 13 stars'] },
  { id: 'fathers-day', name: "Father's Day", floating: true, category: 'major', emoji: '👔',
    blurb: '3rd Sunday June. Tools, fishing, tobacco-style aesthetics work well for bongs.',
    designIdeas: ['Vintage tool wall', 'Fishing scene with rod & reel', 'Whiskey & cigar still life'] },
  { id: 'juneteenth', name: 'Juneteenth', month: 6, day: 19, category: 'awareness', emoji: '✊🏾',
    blurb: 'Emancipation Day — significant cultural marker.',
    designIdeas: ['Red, black, green motif w/ broken chains'] },
  { id: 'summer-solstice', name: 'Summer Solstice / Litha', month: 6, day: 21, category: 'seasonal', emoji: '☀️',
    blurb: 'Longest day, sun worship, festivals.',
    designIdeas: ['Sun with rays interwoven w/ wildflowers', 'Stonehenge silhouette at sunrise'] },
  { id: 'social-media-day', name: 'Social Media Day', month: 6, day: 30, category: 'fun', emoji: '📱',
    blurb: 'Niche but funny — pixel/icon aesthetics.',
    designIdeas: ['Wifi symbol as halo'] },

  /* ===== JULY ===== */
  { id: 'canada-day', name: 'Canada Day', month: 7, day: 1, category: 'cultural', emoji: '🇨🇦',
    blurb: 'Maple leaves, mountains, moose.',
    designIdeas: ['Moose silhouette in maple-leaf frame', 'Mountain range w/ northern lights'] },
  { id: 'world-ufo-day', name: 'World UFO Day', month: 7, day: 2, category: 'fun', emoji: '🛸',
    blurb: 'Roswell-style retro sci-fi.',
    designIdeas: ['Flying saucer with abduction beam', 'Alien glyphs constellation'] },
  { id: 'fourth', name: 'Independence Day', month: 7, day: 4, category: 'major', emoji: '🎇',
    blurb: 'Fireworks, eagles, stars & stripes — huge sales driver.',
    designIdeas: ['Bald eagle with fireworks behind', 'Vintage Americana banner', '13 stars in art-nouveau wreath'] },
  { id: 'oil-day', name: '7-10 / Oil Day / Dab Day', month: 7, day: 10, category: 'cannabis', emoji: '💧',
    blurb: '"OIL" upside-down. Concentrate culture day — second-biggest cannabis date after 4/20.',
    designIdeas: ['Honey-amber drop with rosin texture', 'Dab rig silhouette with terpene molecules', 'Oil swirl mandala'] },
  { id: 'french-fry-day', name: 'National French Fry Day', month: 7, day: 13, category: 'food', emoji: '🍟',
    blurb: 'Comfort food, casual aesthetics.',
    designIdeas: [] },
  { id: 'shark-week', name: 'Shark Week (approx)', month: 7, day: 16, category: 'awareness', emoji: '🦈',
    blurb: 'Discovery Channel — date approximate. Marine motifs.',
    designIdeas: ['Shark silhouette in wave', 'Vintage shark anatomy print'] },
  { id: 'world-emoji', name: 'World Emoji Day', month: 7, day: 17, category: 'fun', emoji: '😀',
    blurb: 'Emoji culture — minimal, iconic, fun.',
    designIdeas: ['Emoji grid as a constellation', 'Smiley face hidden in florals'] },
  { id: 'ice-cream-day', name: 'National Ice Cream Day', month: 7, day: 20, category: 'food', emoji: '🍦',
    blurb: '3rd Sunday Jul — but Jul 20 also works for general Ice Cream Month.',
    designIdeas: ['Triple-scoop cone with drips'] },
  { id: 'cousins-day', name: 'National Cousins Day', month: 7, day: 24, category: 'fun', emoji: '👨‍👩‍👧‍👦',
    blurb: 'Family — multi-portrait designs.',
    designIdeas: ['Group silhouette portrait'] },

  /* ===== AUGUST ===== */
  { id: 'natl-coloring-day', name: 'National Coloring Book Day', month: 8, day: 2, category: 'fun', emoji: '🖍️',
    blurb: 'Line art = laser etching natural fit.',
    designIdeas: ['Coloring page-style mandala'] },
  { id: 'beer-day', name: 'IPA Day', month: 8, day: 1, category: 'food', emoji: '🍺',
    blurb: 'First Thursday Aug — but Aug 1 is the legacy date.',
    designIdeas: ['Hop cone with foam crown'] },
  { id: 'lion-day', name: 'World Lion Day', month: 8, day: 10, category: 'awareness', emoji: '🦁',
    blurb: 'Conservation — bold animal portraits sell.',
    designIdeas: ['Lion in art-nouveau medallion', 'Lion mane interwoven with savanna grass'] },
  { id: 'leftie-day', name: 'International Lefthanders Day', month: 8, day: 13, category: 'fun', emoji: '✋',
    blurb: '10% of population — niche but loyal market.',
    designIdeas: ['Hand silhouette w/ fingerprint detail'] },
  { id: 'burning-man', name: 'Burning Man begins', month: 8, day: 25, category: 'music', emoji: '🔥',
    blurb: 'Late Aug. Counterculture, festival, art-car aesthetic.',
    designIdeas: ['The Man silhouette in flames', 'Mandala built from desert dust'] },
  { id: 'dog-day', name: 'National Dog Day', month: 8, day: 26, category: 'pet', emoji: '🐕',
    blurb: 'Massive pet-merch driver. Customizable per breed.',
    designIdeas: ['Dog portrait with botanical halo', 'Loyal-companion silhouette by a hearth', 'Pack of breed silhouettes in a row'] },

  /* ===== SEPTEMBER ===== */
  { id: 'labor-day', name: 'Labor Day', floating: true, category: 'major', emoji: '🛠️',
    blurb: '1st Monday Sept. Working class, tools, end of summer.',
    designIdeas: ['Union banner w/ wrench & hammer', 'Lunchpail still-life'] },
  { id: 'natl-cheese-pizza-day', name: 'National Cheese Pizza Day', month: 9, day: 5, category: 'food', emoji: '🧀',
    blurb: 'Doubling up on pizza.',
    designIdeas: [] },
  { id: 'grandparents-day', name: 'Grandparents Day', floating: true, category: 'fun', emoji: '👴',
    blurb: 'Sunday after Labor Day.',
    designIdeas: ['Vintage portrait frame', 'Hands holding hands across generations'] },
  { id: 'patriot-day', name: 'Patriot Day (9/11)', month: 9, day: 11, category: 'awareness', emoji: '🕊️',
    blurb: 'Solemn remembrance.',
    designIdeas: ['Two towers silhouetted as memorial'] },
  { id: 'guac-day', name: 'National Guacamole Day', month: 9, day: 16, category: 'food', emoji: '🥑',
    blurb: 'Avocado culture is real.',
    designIdeas: ['Avocado halved with botanical leaves', 'Guac bowl still life'] },
  { id: 'pirate-day', name: 'Talk Like a Pirate Day', month: 9, day: 19, category: 'fun', emoji: '🏴‍☠️',
    blurb: 'Goofy but iconic — skulls & crossbones perform well.',
    designIdeas: ['Skull & crossbones with treasure-map ornament', 'Pirate ship sailing through smoke'] },
  { id: 'autumn-equinox', name: 'Autumn Equinox / Mabon', month: 9, day: 22, category: 'seasonal', emoji: '🍁',
    blurb: 'Foliage, harvest, balance.',
    designIdeas: ['Maple leaf with intricate vein detail', 'Harvest cornucopia'] },
  { id: 'coffee-day', name: 'International Coffee Day', month: 9, day: 29, category: 'food', emoji: '☕',
    blurb: 'Specialty-coffee aesthetic, latte art.',
    designIdeas: ['Latte-art rosetta', 'Coffee plant w/ cherries'] },

  /* ===== OCTOBER ===== */
  { id: 'world-smile-day', name: 'World Smile Day', month: 10, day: 4, category: 'fun', emoji: '😊',
    blurb: '1st Friday Oct. Smiley-face culture.',
    designIdeas: ['Smiley face hidden in floral mandala'] },
  { id: 'taco-day', name: 'National Taco Day', month: 10, day: 4, category: 'food', emoji: '🌮',
    blurb: 'Folksy and fun.',
    designIdeas: ['Taco with sombrero & maracas', 'Geometric taco still-life'] },
  { id: 'columbus-day', name: 'Columbus Day / Indigenous Peoples Day', floating: true, category: 'cultural', emoji: '🌎',
    blurb: '2nd Mon Oct. Increasingly observed as Indigenous Peoples Day.',
    designIdeas: ['Indigenous-art-style sun', 'Hawk in geometric motif'] },
  { id: 'pumpkin-day', name: 'Pumpkin Day', month: 10, day: 26, category: 'seasonal', emoji: '🎃',
    blurb: 'Fall harvest, lead-in to Halloween.',
    designIdeas: ['Carved pumpkin in art-nouveau frame'] },
  { id: 'cat-day', name: 'National Cat Day', month: 10, day: 29, category: 'pet', emoji: '🐈',
    blurb: 'Cat people are devoted. Mystical motifs play well.',
    designIdeas: ['Black cat with crescent moon', 'Egyptian Bastet with art-nouveau ornament', 'Cat curled into a yin-yang'] },
  { id: 'halloween', name: 'Halloween', month: 10, day: 31, category: 'major', emoji: '🎃',
    blurb: 'Top 3 sales date for spooky/dark aesthetics. Start designing in August.',
    designIdeas: ['Jack-o-lantern with intricate carving', 'Witch silhouette w/ smoke serpents', 'Skull bouquet of dead roses', 'Haunted Victorian house', 'Ouija board pattern'] },
  { id: 'diwali', name: 'Diwali', floating: true, category: 'cultural', emoji: '🪔',
    blurb: 'Festival of lights — diyas, mandalas, gold accents.',
    designIdeas: ['Diya oil lamp with rangoli border', 'Peacock mandala', 'Lotus & lantern arrangement'] },

  /* ===== NOVEMBER ===== */
  { id: 'dotd', name: 'Día de los Muertos', month: 11, day: 2, category: 'cultural', emoji: '💀',
    blurb: 'Sugar skulls, marigolds, papel picado — gorgeous laser-etch fit.',
    designIdeas: ['Ornate sugar skull with marigolds', 'Papel-picado banner with floral skulls', 'Catrina portrait'] },
  { id: 'sandwich-day', name: 'National Sandwich Day', month: 11, day: 3, category: 'food', emoji: '🥪',
    blurb: 'Comfort food.',
    designIdeas: [] },
  { id: 'guy-fawkes', name: 'Guy Fawkes Day', month: 11, day: 5, category: 'cultural', emoji: '🎆',
    blurb: '"Remember, remember the 5th of November." V-mask iconography.',
    designIdeas: ['V mask silhouette', 'Parliament w/ fireworks'] },
  { id: 'veterans-day', name: 'Veterans Day', month: 11, day: 11, category: 'major', emoji: '🎖️',
    blurb: 'Patriotic, somber, eagle/flag motifs.',
    designIdeas: ['Eagle with folded flag', 'Poppy memorial wreath'] },
  { id: 'pickle-day', name: 'National Pickle Day', month: 11, day: 14, category: 'food', emoji: '🥒',
    blurb: 'Pickle culture is having a moment.',
    designIdeas: [] },
  { id: 'green-wednesday', name: 'Green Wednesday', floating: true, category: 'cannabis', emoji: '🟢',
    blurb: 'Day before Thanksgiving — biggest cannabis sales day of Q4.',
    designIdeas: ['Cannabis cornucopia', 'Family gathering w/ smoke wreath'] },
  { id: 'thanksgiving', name: 'Thanksgiving', floating: true, category: 'major', emoji: '🦃',
    blurb: '4th Thursday Nov. Harvest, gratitude, family.',
    designIdeas: ['Turkey in art-nouveau frame', 'Cornucopia of botanicals', 'Pumpkin pie still life'] },
  { id: 'black-friday', name: 'Black Friday', floating: true, category: 'major', emoji: '🛍️',
    blurb: 'Drive holiday limited editions.',
    designIdeas: ['Bold typographic SALE motif', 'Shopping bags as gift wrap'] },
  { id: 'cyber-monday', name: 'Cyber Monday', floating: true, category: 'major', emoji: '💻',
    blurb: 'Monday after Thanksgiving — online sales peak.',
    designIdeas: ['Pixel-art skyline'] },

  /* ===== DECEMBER ===== */
  { id: 'world-aids-day', name: 'World AIDS Day', month: 12, day: 1, category: 'awareness', emoji: '🎗️',
    blurb: 'Red ribbon, awareness, remembrance.',
    designIdeas: ['Red ribbon woven into botanical wreath'] },
  { id: 'pearl-harbor', name: 'Pearl Harbor Remembrance Day', month: 12, day: 7, category: 'awareness', emoji: '⚓',
    blurb: 'Solemn, naval motifs.',
    designIdeas: ['Naval anchor with poppy wreath'] },
  { id: 'cookie-day', name: 'National Cookie Day', month: 12, day: 4, category: 'food', emoji: '🍪',
    blurb: 'Comfort + bakery aesthetics.',
    designIdeas: [] },
  { id: 'hanukkah', name: 'Hanukkah begins', floating: true, category: 'cultural', emoji: '🕎',
    blurb: 'Menorah, dreidel, blue & gold.',
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

/* ────────────────────────────────────────────────────────────────────
 * Date helpers
 * ──────────────────────────────────────────────────────────────────── */

const MS_PER_DAY = 86_400_000;

/**
 * Returns the Date the event occurs in the given year. Returns null if a
 * floating event has no rule/lookup for that year.
 */
export function dateInYear(event: HolidayEvent, year: number): Date | null {
  if (event.floating) return computeFloatingDate(event.id, year);
  if (event.month && event.day) return new Date(year, event.month - 1, event.day);
  return null;
}

/**
 * Returns the next chronological occurrence of the event from `from`.
 * For floating events without a rule for the next year, returns null.
 */
export function nextOccurrence(event: HolidayEvent, from = new Date()): Date | null {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let candidate = dateInYear(event, today.getFullYear());
  if (candidate && candidate.getTime() < today.getTime()) {
    candidate = dateInYear(event, today.getFullYear() + 1);
  }
  return candidate;
}

export function daysUntil(event: HolidayEvent, from = new Date()): number {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const next = nextOccurrence(event, from);
  if (!next) return Number.MAX_SAFE_INTEGER;
  return Math.round((next.getTime() - today.getTime()) / MS_PER_DAY);
}

/** Events upcoming within `withinDays` (inclusive). Sorted ascending. */
export function upcomingEvents(withinDays = 21, from = new Date()): HolidayEvent[] {
  return HOLIDAY_EVENTS
    .map((e) => ({ event: e, days: daysUntil(e, from) }))
    .filter((x) => x.days <= withinDays && x.days < Number.MAX_SAFE_INTEGER)
    .sort((a, b) => a.days - b.days)
    .map((x) => x.event);
}

/** Rolling-year view starting from today. */
export function eventsRollingYear(from = new Date()): HolidayEvent[] {
  return [...HOLIDAY_EVENTS].sort(
    (a, b) => daysUntil(a, from) - daysUntil(b, from)
  );
}

/** All events that occur within a specific calendar year. */
export function eventsForYear(year: number): { event: HolidayEvent; date: Date }[] {
  return HOLIDAY_EVENTS
    .map((e) => ({ event: e, date: dateInYear(e, year) }))
    .filter((x): x is { event: HolidayEvent; date: Date } => x.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
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
  music:     { label: 'Music',     cls: 'st-ideation' },
};
