import fs from "node:fs/promises";
import path from "node:path";
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

export const DEFAULT_SESSION_TTL_MS = 3 * 24 * 60 * 60 * 1000;

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

  constructor(private readonly ttlMs = DEFAULT_SESSION_TTL_MS) {}

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

interface PersistedSessionStore {
  version: 1;
  sessions: ConversationSession[];
}

export class FileSessionRepository implements SessionRepository {
  private sessions = new Map<string, ConversationSession>();
  private index = new Map<string, string>();
  private loadPromise?: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly ttlMs = DEFAULT_SESSION_TTL_MS,
  ) {}

  private ensureLoaded(): Promise<void> {
    this.loadPromise ??= this.loadFromDisk();
    return this.loadPromise;
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const store = JSON.parse(raw) as PersistedSessionStore;
      if (store.version !== 1 || !Array.isArray(store.sessions)) {
        throw new Error(`Unsupported SIT session store format: ${this.filePath}`);
      }
      for (const session of store.sessions) {
        if (isExpired(session)) continue;
        this.sessions.set(session.id, session);
        this.index.set(`${session.channel}:${session.userKey}`, session.id);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }

  private persist(): Promise<void> {
    const snapshot: PersistedSessionStore = {
      version: 1,
      sessions: [...this.sessions.values()],
    };
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporaryPath, JSON.stringify(snapshot), "utf8");
      await fs.rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }

  async create(input: { userKey: string; channel: ConversationChannel }): Promise<ConversationSession> {
    await this.ensureLoaded();
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
    await this.persist();
    return session;
  }

  async load(sessionId: string): Promise<ConversationSession | undefined> {
    await this.ensureLoaded();
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (isExpired(session)) {
      this.sessions.delete(session.id);
      this.index.delete(`${session.channel}:${session.userKey}`);
      await this.persist();
      return undefined;
    }
    return session;
  }

  async loadOrCreate(input: { userKey: string; channel: ConversationChannel }): Promise<ConversationSession> {
    await this.ensureLoaded();
    const existingId = this.index.get(`${input.channel}:${input.userKey}`);
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
    };
    this.sessions.set(sessionId, updated);
    await this.persist();
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
    };
    this.sessions.set(sessionId, reset);
    await this.persist();
    return reset;
  }

  async expire(sessionId: string): Promise<void> {
    await this.ensureLoaded();
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.set(sessionId, {
      ...session,
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });
    await this.persist();
  }
}

function configuredTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const days = Number(env.SIT_SESSION_TTL_DAYS ?? "3");
  return Number.isFinite(days) && days > 0
    ? days * 24 * 60 * 60 * 1000
    : DEFAULT_SESSION_TTL_MS;
}

const sessionStorePath = process.env.SIT_SESSION_STORE_PATH
  ? path.resolve(process.env.SIT_SESSION_STORE_PATH)
  : path.resolve(process.cwd(), ".data", "conversation-sessions.json");

export const sessionRepository: SessionRepository = process.env.SIT_SESSION_PERSISTENCE === "memory"
  ? new InMemorySessionRepository(configuredTtlMs())
  : new FileSessionRepository(sessionStorePath, configuredTtlMs());
