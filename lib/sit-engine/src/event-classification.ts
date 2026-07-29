export type PrimaryExperience =
  | "music"
  | "party"
  | "wellness"
  | "yoga"
  | "breathwork"
  | "movement"
  | "spiritual_practice"
  | "conscious_dance"
  | "workshop"
  | "community"
  | "food"
  | "nature"
  | "coworking"
  | "practical"
  | "other";

export type EventSecondaryTag =
  | "music"
  | "live_music"
  | "techno"
  | "movement"
  | "community"
  | "meditation"
  | "conscious"
  | "fitness"
  | "wellness"
  | "spiritual"
  | "social"
  | "food"
  | "nature"
  | "coworking";

export type EventHumanNeed =
  | "burnout"
  | "relaxation"
  | "healing"
  | "celebration"
  | "connection"
  | "belonging"
  | "reset";

export interface EventClassification {
  primaryExperience: PrimaryExperience;
  secondaryTags: EventSecondaryTag[];
  humanNeeds: EventHumanNeed[];
  classificationReason: string;
  humanNeedReason: string;
}

export interface EventClassificationInput {
  title: string;
  sourceCategory?: string;
  venue?: string;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function classifyPrimary(text: string, sourceCategory: string): Pick<EventClassification, "primaryExperience" | "classificationReason"> {
  if (/\b(kirtan|satsang|cacao ceremony|sacred sound|bhakti|spiritual practice|tantra lecture)\b/.test(text)) {
    return { primaryExperience: "spiritual_practice", classificationReason: "The event is centered on a spiritual or contemplative practice." };
  }
  if (/\b(ecstatic dance|conscious dance|soulmotion|five rhythms|5 rhythms)\b/.test(text)) {
    return { primaryExperience: "conscious_dance", classificationReason: "The event is centered on a conscious dance practice." };
  }
  if (/\b(acro\s*yoga|acroyoga)\b/.test(text)) {
    return { primaryExperience: "movement", classificationReason: "Acro Yoga is primarily a partner movement practice." };
  }
  if (/\b(breathwork|holotropic breath|rebirthing breath|breath journey)\b/.test(text)) {
    return { primaryExperience: "breathwork", classificationReason: "Breathwork is the central activity." };
  }
  if (/\b(yoga|vinyasa(?: flow)?|yin(?: (?:yoga|and restorative))?|restorative yoga|ashtanga|hatha|aerial yoga)\b/.test(text)) {
    return { primaryExperience: "yoga", classificationReason: "Yoga is the central activity." };
  }
  if (/\b(qi-?gong|qigong|movement practice|somatic movement|dance class|contact dance|tribal dance|mobility class)\b/.test(text)) {
    return { primaryExperience: "movement", classificationReason: "Guided movement is the central activity." };
  }
  if (/\b(sound healing|sound bath|meditation|sauna|ice bath|wellness|healing session|massage|tre®|nervous system)\b/.test(text)) {
    return { primaryExperience: "wellness", classificationReason: "The event is centered on a wellness practice." };
  }
  if (/\b(beach party|jungle party|party|rave|nightlife|club night|full moon|festival)\b/.test(text)) {
    return { primaryExperience: "party", classificationReason: "The event is presented primarily as a party or festival." };
  }
  if (/\b(live(?:\s+[a-z&]+){0,4}\s+music|live band|live performance|concert|acoustic night|open mic|music jam|jam session|karaoke|dj set|dj session|live dj|sound system|techno night|house night|music night)\b/.test(text)) {
    return { primaryExperience: "music", classificationReason: "The event is centered on listening to or performing music." };
  }
  if (/\b(workshop|masterclass|training|course|lecture|class)\b/.test(text)) {
    return { primaryExperience: "workshop", classificationReason: "The event is primarily a structured learning experience." };
  }
  if (/\b(coworking|co-working|networking|entrepreneur|business meetup|nomad meetup)\b/.test(text)) {
    return { primaryExperience: "coworking", classificationReason: "The event is centered on work or professional connection." };
  }
  if (/\b(dinner|brunch|tasting|food market|supper|cooking)\b/.test(text)) {
    return { primaryExperience: "food", classificationReason: "Food is the central experience." };
  }
  if (/\b(hike|hiking|waterfall|snorkel|kayak|nature walk|jungle walk)\b/.test(text)) {
    return { primaryExperience: "nature", classificationReason: "The destination's natural environment is the central experience." };
  }
  if (/\b(community|gathering|clothes swap|volunteer|social meetup|sharing circle)\b/.test(text)) {
    return { primaryExperience: "community", classificationReason: "Community participation is the central experience." };
  }

  if (/\bmusic\b/.test(sourceCategory)) return { primaryExperience: "music", classificationReason: "The trusted source classifies this as music." };
  if (/\bpart(?:y|ies)|nightlife|festival\b/.test(sourceCategory)) return { primaryExperience: "party", classificationReason: "The trusted source classifies this as a party or nightlife event." };
  if (/\byoga\b/.test(sourceCategory)) return { primaryExperience: "yoga", classificationReason: "The trusted source classifies this as yoga." };
  if (/\bwellness\b/.test(sourceCategory)) return { primaryExperience: "wellness", classificationReason: "The trusted source classifies this as wellness." };
  if (/\bdance|movement|sports?|fitness\b/.test(sourceCategory)) return { primaryExperience: "movement", classificationReason: "The trusted source classifies this as movement or fitness." };
  if (/\bconscious|spiritual|tantra\b/.test(sourceCategory)) return { primaryExperience: "spiritual_practice", classificationReason: "The trusted source classifies this as a conscious or spiritual practice." };
  if (/\bworkshop|learning|discussion|arts?|creativity\b/.test(sourceCategory)) return { primaryExperience: "workshop", classificationReason: "The trusted source classifies this as a learning or creative experience." };
  if (/\bcommunity|social|relationships?|connection|market\b/.test(sourceCategory)) return { primaryExperience: "community", classificationReason: "The trusted source classifies this as a social or community event." };
  if (/\bfood|drink\b/.test(sourceCategory)) return { primaryExperience: "food", classificationReason: "The trusted source classifies this as a food or drink experience." };
  return { primaryExperience: "other", classificationReason: "No dominant experience is explicit enough to classify more narrowly." };
}

function classifySecondaryTags(text: string): EventSecondaryTag[] {
  const tags: EventSecondaryTag[] = [];
  if (/\b(music|dj|band|concert|acoustic|open mic|music jam|jam session|kirtan|sacred sound|ecstatic dance)\b/.test(text)) tags.push("music");
  if (/\b(live(?:\s+[a-z&]+){0,4}\s+music|live band|live performance|concert|acoustic|open mic)\b/.test(text)) tags.push("live_music");
  if (/\b(techno|minimal|psytrance|trance|tech house)\b/.test(text)) tags.push("techno");
  if (/\b(yoga|movement|dance|qigong|qi-gong|somatic|acro)\b/.test(text)) tags.push("movement");
  if (/\b(community|gathering|circle|kirtan|ecstatic dance|jam|partner|social)\b/.test(text)) tags.push("community");
  if (/\b(meditation|kirtan|sound healing|satsang|mindful)\b/.test(text)) tags.push("meditation");
  if (/\b(conscious|ecstatic|kirtan|satsang|cacao|ceremony|sacred)\b/.test(text)) tags.push("conscious");
  if (/\b(fitness|acro|workout|strength|sport)\b/.test(text)) tags.push("fitness");
  if (/\b(wellness|yoga|breathwork|healing|meditation|somatic|sauna|ice bath|massage)\b/.test(text)) tags.push("wellness");
  if (/\b(spiritual|kirtan|satsang|bhakti|tantra|ceremony|sacred)\b/.test(text)) tags.push("spiritual");
  if (/\b(social|community|gathering|party|jam|networking)\b/.test(text)) tags.push("social");
  if (/\b(food|dinner|brunch|tasting|cooking)\b/.test(text)) tags.push("food");
  if (/\b(nature|jungle|hike|waterfall|snorkel|kayak)\b/.test(text)) tags.push("nature");
  if (/\b(coworking|co-working|networking|entrepreneur|nomad)\b/.test(text)) tags.push("coworking");
  return unique(tags);
}

function classifyHumanNeeds(primaryExperience: PrimaryExperience): Pick<EventClassification, "humanNeeds" | "humanNeedReason"> {
  const mapping: Record<PrimaryExperience, EventHumanNeed[]> = {
    music: ["celebration", "connection"],
    party: ["celebration", "connection", "belonging"],
    wellness: ["burnout", "relaxation", "healing", "reset"],
    yoga: ["burnout", "relaxation", "healing", "reset"],
    breathwork: ["relaxation", "healing", "reset"],
    movement: ["healing", "connection", "reset"],
    spiritual_practice: ["healing", "connection", "belonging", "reset"],
    conscious_dance: ["celebration", "connection", "belonging", "reset"],
    workshop: ["connection", "belonging"],
    community: ["connection", "belonging"],
    food: ["celebration", "connection"],
    nature: ["burnout", "relaxation", "reset"],
    coworking: ["connection", "belonging"],
    practical: [],
    other: [],
  };
  const humanNeeds = mapping[primaryExperience];
  return {
    humanNeeds,
    humanNeedReason: humanNeeds.length > 0
      ? `${primaryExperience} experiences can support ${humanNeeds.join(", ")}.`
      : "The event does not provide enough evidence for a human-need classification.",
  };
}

export function classifyEventExperience(input: EventClassificationInput): EventClassification {
  const sourceCategory = (input.sourceCategory ?? "").toLowerCase();
  const titleText = input.title.toLowerCase();
  const contentText = `${titleText} ${input.venue ?? ""}`.toLowerCase();
  const primary = classifyPrimary(titleText, sourceCategory);
  return {
    ...primary,
    secondaryTags: classifySecondaryTags(`${contentText} ${sourceCategory}`),
    ...classifyHumanNeeds(primary.primaryExperience),
  };
}
