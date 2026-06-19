export interface UserContext {
  purpose?: string;
  purposeFollowUpAsked: boolean;
  duration?: string;
  durationAsked: boolean;
  scooter?: string;
  scooterAsked: boolean;
  sociability?: string;
  sociabilityAsked: boolean;
  exchangeCount: number;
  briefGenerated: boolean;
  /** Unix ms timestamp of last activity — used for session TTL */
  lastActiveAt: number;
}

export interface SITBrief {
  lookingFor: string;
  avoid: string[];
  stayArea: string;
  experiences: string[];
  localInsight: string;
}

export interface SITResponse {
  message: string;
  suggestions?: string[];
  briefReady?: boolean;
  updatedContext: UserContext;
}

export const INITIAL_CTX: UserContext = {
  purposeFollowUpAsked: false,
  durationAsked: false,
  scooterAsked: false,
  sociabilityAsked: false,
  exchangeCount: 0,
  briefGenerated: false,
  lastActiveAt: 0,
};
