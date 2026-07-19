import { createRequire } from "node:module";

export interface FeedbackRecord {
  id: string;
  rating: "up" | "down";
  comment?: string;
  chatId: number;
  userId: number;
  timestamp: number;
}

export interface UserProfile {
  telegramId: number;
  displayName: string;
  firstSeen: number;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function isRecordExpired(record: { timestamp: number }, nowMs: number): boolean {
  return nowMs - record.timestamp > NINETY_DAYS_MS;
}

export interface DataStore {
  saveFeedback(record: FeedbackRecord): Promise<void>;
  getFeedbackByChat(chatId: number): Promise<FeedbackRecord[]>;
  getAllFeedback(): Promise<FeedbackRecord[]>;
  saveProfile(profile: UserProfile): Promise<void>;
  getProfile(telegramId: number): Promise<UserProfile | undefined>;
  cleanupExpired(nowMs?: number): Promise<number>;
}

class InMemoryDataStore implements DataStore {
  private feedback: FeedbackRecord[] = [];
  private profiles = new Map<number, UserProfile>();

  async saveFeedback(record: FeedbackRecord): Promise<void> {
    this.feedback.push(record);
  }

  async getFeedbackByChat(chatId: number): Promise<FeedbackRecord[]> {
    return this.feedback.filter((r) => r.chatId === chatId);
  }

  async getAllFeedback(): Promise<FeedbackRecord[]> {
    return [...this.feedback];
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    this.profiles.set(profile.telegramId, profile);
  }

  async getProfile(telegramId: number): Promise<UserProfile | undefined> {
    return this.profiles.get(telegramId);
  }

  async cleanupExpired(nowMs?: number): Promise<number> {
    const now = nowMs ?? Date.now();
    const before = this.feedback.length;
    this.feedback = this.feedback.filter((r) => !isRecordExpired(r, now));
    return before - this.feedback.length;
  }
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

class RedisDataStore implements DataStore {
  private prefix = "metaqa:";

  constructor(private client: RedisClient) {}

  private k(key: string): string {
    return this.prefix + key;
  }

  async saveFeedback(record: FeedbackRecord): Promise<void> {
    await this.client.set(this.k(`fb:${record.id}`), JSON.stringify(record));
    // Add to chat index
    const idxKey = this.k(`fb_idx:${record.chatId}`);
    const existing = await this.client.get(idxKey);
    const ids: string[] = existing ? JSON.parse(existing) : [];
    ids.push(record.id);
    await this.client.set(idxKey, JSON.stringify(ids));
  }

  async getFeedbackByChat(chatId: number): Promise<FeedbackRecord[]> {
    const idxKey = this.k(`fb_idx:${chatId}`);
    const raw = await this.client.get(idxKey);
    if (!raw) return [];
    const ids: string[] = JSON.parse(raw);
    const records: FeedbackRecord[] = [];
    for (const id of ids) {
      const r = await this.client.get(this.k(`fb:${id}`));
      if (r) records.push(JSON.parse(r));
    }
    return records;
  }

  async getAllFeedback(): Promise<FeedbackRecord[]> {
    const keys = await this.client.keys(this.k("fb:*"));
    const records: FeedbackRecord[] = [];
    for (const key of keys) {
      if (key.includes(":fb_idx:")) continue;
      const raw = await this.client.get(key);
      if (raw) records.push(JSON.parse(raw));
    }
    return records;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await this.client.set(this.k(`profile:${profile.telegramId}`), JSON.stringify(profile));
  }

  async getProfile(telegramId: number): Promise<UserProfile | undefined> {
    const raw = await this.client.get(this.k(`profile:${telegramId}`));
    return raw ? JSON.parse(raw) : undefined;
  }

  async cleanupExpired(nowMs?: number): Promise<number> {
    const now = nowMs ?? Date.now();
    const keys = await this.client.keys(this.k("fb:*"));
    let removed = 0;
    for (const key of keys) {
      if (key.includes(":fb_idx:")) continue;
      const raw = await this.client.get(key);
      if (raw) {
        const record: FeedbackRecord = JSON.parse(raw);
        if (isRecordExpired(record, now)) {
          await this.client.del(key);
          removed++;
        }
      }
    }
    return removed;
  }
}

let store: DataStore | undefined;

function createRedisStore(): DataStore {
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ioredis: any = require("ioredis");
  const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
  const url = process.env.REDIS_URL;
  if (!url) return new InMemoryDataStore();
  const client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
  return new RedisDataStore(client as RedisClient);
}

export function getDataStore(): DataStore {
  if (!store) store = createRedisStore();
  return store;
}

export function getFeedbackForChat(chatId: number): Promise<FeedbackRecord[]> {
  return getDataStore().getFeedbackByChat(chatId);
}

export async function hasNegativeFeedback(chatId: number): Promise<boolean> {
  const records = await getDataStore().getFeedbackByChat(chatId);
  return records.some((r) => r.rating === "down");
}

export function cleanupExpiredData(nowMs?: number): Promise<number> {
  return getDataStore().cleanupExpired(nowMs);
}
