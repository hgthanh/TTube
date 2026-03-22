import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { Favorite, InsertFavorite } from "@shared/schema";

export function useFavorites() {
  return useQuery({
    queryKey: [api.favorites.list.path],
    queryFn: async () => {
      const res = await fetch(api.favorites.list.path, { credentials: "include" });
      if (res.status === 401) return null; // Not logged in
      if (!res.ok) throw new Error("Failed to fetch favorites");
      return await res.json() as Favorite[];
    },
  });
}

export function useIsFavorite(videoId: string) {
  return useQuery({
    queryKey: [api.favorites.check.path, videoId],
    queryFn: async () => {
      const url = buildUrl(api.favorites.check.path, { videoId });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 401) return { isFavorite: false };
      if (!res.ok) throw new Error("Failed to check favorite status");
      return await res.json() as { isFavorite: boolean; id?: number };
    },
    enabled: !!videoId,
  });
}

export function useAddFavorite() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Omit<InsertFavorite, "userId">) => {
      const res = await fetch(api.favorites.create.path, {
        method: api.favorites.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Unauthorized");
        throw new Error("Failed to add to favorites");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.favorites.list.path] });
      // Also invalidate the specific check query
      queryClient.invalidateQueries({ queryKey: [api.favorites.check.path] });
      toast({
        title: "Added to favorites",
        description: "This video has been saved to your library.",
      });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err.message === "Unauthorized" ? "Please login to save favorites" : "Could not add favorite",
        variant: "destructive",
      });
    },
  });
}

export function useRemoveFavorite() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.favorites.delete.path, { id });
      const res = await fetch(url, {
        method: api.favorites.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove favorite");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.favorites.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.favorites.check.path] });
      toast({
        title: "Removed from favorites",
        description: "Video removed from your library.",
      });
    },
  });
}
