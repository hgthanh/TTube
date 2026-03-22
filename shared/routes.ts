import { z } from 'zod';
import { insertFavoriteSchema, type Favorite } from './schema';

// Shared error schemas
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Search filters
export const searchFiltersSchema = z.object({
  q: z.string().min(1),
  type: z.enum(['video', 'channel', 'playlist']).optional(),
});

export const api = {
  // YouTube Proxy Endpoints
  yt: {
    search: {
      method: 'GET' as const,
      path: '/api/yt/search' as const,
      input: searchFiltersSchema,
      responses: {
        200: z.array(z.any()), // Loose type for now as Innertube returns complex objects
        400: errorSchemas.validation,
      },
    },
    video: {
      method: 'GET' as const,
      path: '/api/yt/video/:id' as const,
      responses: {
        200: z.any(), // Video details + stream info
        404: errorSchemas.notFound,
      },
    },
    stream: {
        method: 'GET' as const,
        path: '/api/yt/stream/:id' as const,
        responses: {
            200: z.any(),
            404: errorSchemas.notFound
        }
    },
    comments: {
      method: 'GET' as const,
      path: '/api/yt/comments/:id' as const,
      responses: {
        200: z.any(),
      },
    },
    channel: {
      method: 'GET' as const,
      path: '/api/yt/channel/:id' as const,
      responses: {
        200: z.any(),
        404: errorSchemas.notFound,
      },
    },
  },
  // Favorites Endpoints
  favorites: {
    list: {
      method: 'GET' as const,
      path: '/api/favorites' as const,
      responses: {
        200: z.array(z.custom<Favorite>()),
      },
    },
    check: {
        method: 'GET' as const,
        path: '/api/favorites/:videoId/check' as const,
        responses: {
            200: z.object({ isFavorite: z.boolean(), id: z.number().optional() })
        }
    },
    create: {
      method: 'POST' as const,
      path: '/api/favorites' as const,
      input: insertFavoriteSchema.omit({ userId: true }), // userId comes from auth session
      responses: {
        201: z.custom<Favorite>(),
        400: errorSchemas.validation,
        401: errorSchemas.validation, // Unauthorized
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/favorites/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
