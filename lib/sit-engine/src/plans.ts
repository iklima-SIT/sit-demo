import type { PlanResult, PlanService, UserContext } from "./types.js";

export type PlanDuration = "3-day" | "7-day" | "1-month";

export function resolvePlanDuration(value?: string): PlanDuration | undefined {
  if (!value) return undefined;
  const text = value.toLowerCase();
  if (/\b(3|three)[ -]?days?\b|\bshort\b/.test(text)) return "3-day";
  if (/\b(7|seven)[ -]?days?\b|\b(one|1)[ -]?week\b|\bweek\b/.test(text)) return "7-day";
  if (/\b(30|thirty)[ -]?days?\b|\b(one|1)[ -]?month\b|\bmonths?\b/.test(text)) return "1-month";
  return undefined;
}

function mobilityNote(profile: UserContext): string {
  if (profile.scooter === "learning") {
    return "Keep the route compact around Srithanu, Hinkong, and Thong Sala while you are still getting comfortable on a scooter.";
  }
  if (profile.scooter === "no" || profile.scooter === "prefer-not") {
    return "Keep each day in one area and arrange transport before evening; do not build the plan around remote venues.";
  }
  return "Keep enough space between stops to enjoy the island instead of spending the day crossing it.";
}

function profileReason(profile: UserContext): string {
  if (profile.purpose === "wellness" && profile.purposeDetail === "wellness-rest") {
    return "You said you need rest, so this plan is intentionally light. One meaningful experience per day is enough.";
  }
  const reasons: Record<string, string> = {
    wellness: "This keeps wellness consistent without turning the trip into a packed retreat schedule.",
    music: "This leaves recovery time around the nights that are genuinely worth choosing.",
    community: "This favors repeated, social spaces where connection can develop naturally.",
    nature: "This gives the island enough room to feel like nature rather than a checklist.",
    romance: "This keeps the pace unhurried and protects the moments that are better without an agenda.",
    "remote-work": "This protects a workable rhythm while still giving you a real island experience.",
  };
  return reasons[profile.purpose ?? ""] ?? "This plan favors depth over trying to cover the whole island.";
}

function threeDayActivities(profile: UserContext): string[] {
  const activities: Record<string, string[]> = {
    wellness: [
      "Day 1 - Land softly\nSettle in, have an easy swim, and keep sunset free. Choose a calm dinner and an early night rather than booking a class immediately.",
      "Day 2 - Restore the body\nStart with gentle yoga or breathwork. Leave the middle of the day open for rest, then choose one verified sound-healing, meditation, or slow-movement session in the evening.",
      "Day 3 - Keep what worked\nRepeat the practice that felt best, spend time somewhere quiet near Srithanu or Hinkong, and finish with a relaxed community space only if your energy is there.",
    ],
    music: [
      "Day 1 - Read the island\nKeep the evening flexible and check the live schedule before choosing one music-focused venue.",
      "Day 2 - Choose the strongest night\nBuild the day around one event that matches your music taste. Do not stack venues just to see more.",
      "Day 3 - Slow social finish\nRecover during the day, then choose live music, sunset sound, or an easy social venue rather than another all-night session.",
    ],
    community: [
      "Day 1 - Enter gently\nStart with a recurring class, community cafe, or coworking social where conversation happens naturally.",
      "Day 2 - Return once\nGo back to the area or activity that felt easiest, then add one workshop or sunset gathering.",
      "Day 3 - Follow the connection\nChoose the next step through the people you met, not another random event listing.",
    ],
    nature: [
      "Day 1 - Quiet coast\nChoose one nearby beach, swim, and stay for sunset instead of circling the island.",
      "Day 2 - North or jungle\nPick one nature route suited to the weather and your mobility, with the middle of the day kept light.",
      "Day 3 - Return to your favorite landscape\nRepeat the beach or viewpoint that actually changed your mood and leave the evening open.",
    ],
    romance: [
      "Day 1 - Hinkong sunset\nKeep arrival simple and protect sunset for an unhurried walk or dinner together.",
      "Day 2 - One shared experience\nChoose a private beach, partner practice, or slow island activity, then avoid overplanning the evening.",
      "Day 3 - A memorable finish\nPick one place you both genuinely liked and return for a longer, quieter experience.",
    ],
    "remote-work": [
      "Day 1 - Set the base\nConfirm reliable work space and internet, then take one easy sunset break nearby.",
      "Day 2 - Protect a focus block\nWork first, then choose one class, swim, or social event after the important work is done.",
      "Day 3 - Test the rhythm\nRepeat the schedule that felt sustainable and adjust the balance before adding more commitments.",
    ],
  };
  return activities[profile.purpose ?? ""] ?? [
    "Day 1 - Arrive without chasing the island\nSettle in, explore your immediate area, and keep sunset free.",
    "Day 2 - Choose one meaningful experience\nPick the strongest fit for your mood and leave recovery space around it.",
    "Day 3 - Follow what worked\nReturn to the area, people, or activity that felt most natural instead of starting over.",
  ];
}

function buildThreeDayPlan(profile: UserContext): string {
  return [
    "Here is the 3-day plan I would give you:",
    profileReason(profile),
    ...threeDayActivities(profile),
    mobilityNote(profile),
    "Live classes and events change daily. Ask me for the schedule before each day and I will check the current listings.",
  ].join("\n\n");
}

function buildSevenDayPlan(profile: UserContext): string {
  return [
    "Here is the 7-day shape I would use:",
    profileReason(profile),
    "Days 1-2 - Settle in and learn your immediate area. Keep the first evening easy.",
    "Days 3-4 - Build around the experience that best matches your reason for being here, with only one anchor activity each day.",
    "Day 5 - Leave completely open. This is where the island often becomes personal rather than scheduled.",
    "Day 6 - Return to the place, class, or people that felt right instead of adding another random option.",
    "Day 7 - Keep the final day light and choose one experience you would genuinely regret missing.",
    mobilityNote(profile),
    "Ask me for any day's live schedule when you know the dates and I will attach verified options.",
  ].join("\n\n");
}

function buildMonthPlan(profile: UserContext): string {
  return [
    "For a month, I would plan in chapters rather than filling 30 separate days:",
    profileReason(profile),
    "Week 1 - Arrival and exploration. Test areas, transport, and your natural daily rhythm.",
    "Week 2 - Preference formation. Repeat the classes, places, and social spaces that felt right.",
    "Week 3 - Deepening. Commit to one recurring practice or community instead of continuing to sample everything.",
    "Week 4 - Integration. Keep what genuinely improved the month and leave space before departure.",
    mobilityNote(profile),
    "I can turn any week into a day-by-day plan once your dates and current energy are clear.",
  ].join("\n\n");
}

export function createStaticPlanService(): PlanService {
  return {
    async generate(profile, duration): Promise<PlanResult> {
      const resolvedDuration = resolvePlanDuration(duration);
      if (!resolvedDuration) {
        return {
          message: "How much time should I plan for?",
          options: ["3-Day Plan", "7-Day Plan", "1-Month Plan"],
        };
      }

      const message = resolvedDuration === "3-day"
        ? buildThreeDayPlan(profile)
        : resolvedDuration === "7-day"
          ? buildSevenDayPlan(profile)
          : buildMonthPlan(profile);
      return { message, options: [] };
    },
  };
}

