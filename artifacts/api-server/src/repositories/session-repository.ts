import { createInitialConversationState, type ConversationChannel, type ConversationState, type ConversationTurn, type ConversationMemory } from "@workspace/sit-engine";

export interface ConversationSession {
  id: string;
  userKey: string;
  channel: ConversationChannel;
  state: ConversationState;
  stateVersion: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export type { ConversationState, ConversationTurn, ConversationMemory };

export interface SessionRepository {
  create(input: { userKey: string; channel: ConversationChannel }): Promise<ConversationSession>;
  load(sessionId: string): Promise<ConversationSession | undefined>;
  loadOrCreate(input: { userKey: string; channel: ConversationChannel }): Promise<ConversationSession>;
  update(sessionId: string, state: ConversationState): Promise<ConversationSession>;
  reset(sessionId: string): Promise<ConversationSession>;
  expire(sessionId: string): Promise<void>;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return `sit_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function expiresAt(ttlMs: number): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

function isExpired(session: ConversationSession): boolean {
  return new Date(session.expiresAt).getTime() <= Date.now();
}

export class InMemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, ConversationSession>();
  private index = new Map<string, string>();

  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {}

  async create(input: { userKey: string; channel: ConversationChannel }): Promise<ConversationSession> {
    const session: ConversationSession = {
      id: createId(),
      userKey: input.userKey,
      channel: input.channel,
      state: createInitialConversationState(),
      stateVersion: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      expiresAt: expiresAt(this.ttlMs),
    };
    this.sessions.set(session.id, session);
    this.index.set(`${input.channel}:${input.userKey}`, session.id);
    return session;
  }

  async load(sessionId: string): Promise<ConversationSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (isExpired(session)) {
      this.sessions.delete(session.id);
      this.index.delete(`${session.channel}:${session.userKey}`);
      return undefined;
    }
    return session;
  }

  async loadOrCreate(input: { userKey: string; channel: ConversationChannel }): Promise<ConversationSession> {
    const key = `${input.channel}:${input.userKey}`;
    const existingId = this.index.get(key);
    if (existingId) {
      const existing = await this.load(existingId);
      if (existing) return existing;
    }
    return this.create(input);
  }

  async update(sessionId: string, state: ConversationState): Promise<ConversationSession> {
    const existing = await this.load(sessionId);
    if (!existing) throw new Error(`Session not found: ${sessionId}`);
    const updated: ConversationSession = {
      ...existing,
      state: {
        ...state,
        context: {
          ...state.context,
          lastActiveAt: Date.now(),
        },
      },
      stateVersion: existing.stateVersion + 1,
      updatedAt: nowIso(),
      expiresAt: expiresAt(this.ttlMs),
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async reset(sessionId: string): Promise<ConversationSession> {
    const existing = await this.load(sessionId);
    if (!existing) throw new Error(`Session not found: ${sessionId}`);
    const reset: ConversationSession = {
      ...existing,
      state: createInitialConversationState(),
      stateVersion: existing.stateVersion + 1,
      updatedAt: nowIso(),
      expiresAt: expiresAt(this.ttlMs),
    };
    this.sessions.set(sessionId, reset);
    return reset;
  }

  async expire(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.set(sessionId, {
      ...session,
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });
  }
}

export const sessionRepository = new InMemorySessionRepository();

