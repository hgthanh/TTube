import type { Favorite, InsertFavorite } from "@shared/schema";

export interface IStorage {
  getFavorites(userId: number): Promise<Favorite[]>;
  getFavorite(userId: number, videoId: string): Promise<Favorite | undefined>;
  createFavorite(favorite: InsertFavorite): Promise<Favorite>;
  deleteFavorite(id: number, userId: number): Promise<void>;
}

// In-memory storage — no database required for Vercel deployment.
// Data persists within a single serverless instance lifetime.
class MemStorage implements IStorage {
  private favorites = new Map<number, Favorite>();
  private nextId = 1;

  async getFavorites(userId: number): Promise<Favorite[]> {
    return [...this.favorites.values()].filter((f) => f.userId === userId);
  }

  async getFavorite(userId: number, videoId: string): Promise<Favorite | undefined> {
    return [...this.favorites.values()].find(
      (f) => f.userId === userId && f.videoId === videoId
    );
  }

  async createFavorite(insert: InsertFavorite): Promise<Favorite> {
    const fav: Favorite = {
      id: this.nextId++,
      userId: insert.userId,
      videoId: insert.videoId,
      title: insert.title,
      thumbnailUrl: insert.thumbnailUrl ?? null,
      channelName: insert.channelName ?? null,
      createdAt: new Date(),
    };
    this.favorites.set(fav.id, fav);
    return fav;
  }

  async deleteFavorite(id: number, userId: number): Promise<void> {
    const fav = this.favorites.get(id);
    if (fav && fav.userId === userId) this.favorites.delete(id);
  }
}

export const storage: IStorage = new MemStorage();
