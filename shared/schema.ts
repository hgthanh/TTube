import { z } from "zod";

// ─── Favorites ────────────────────────────────────────────────────────────────

export const insertFavoriteSchema = z.object({
  userId: z.number(),
  videoId: z.string(),
  title: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
  channelName: z.string().nullable().optional(),
});

export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;

export interface Favorite {
  id: number;
  userId: number;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelName: string | null;
  createdAt: Date | null;
}

// ─── YouTube API response types ───────────────────────────────────────────────

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  viewCount: string;
  publishedTime: string;
  lengthSeconds: string;
  isShort: boolean;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail: string;
  subscriberCount: string;
  description: string;
  banner: string;
}

export interface YouTubeComment {
  id: string;
  author: string;
  authorThumbnail: string;
  text: string;
  publishedTime: string;
  likeCount: string;
  replyCount: number;
}
