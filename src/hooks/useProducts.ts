import { useQuery } from "@tanstack/react-query";
import { fetchProducts } from "@/lib/api";
import type { Product } from "@/types/api";

export const useProducts = (apiBaseUrl: string, search: string) =>
  useQuery<Product[], Error>({
    queryKey: ["products", apiBaseUrl, search],
    queryFn: () => fetchProducts(apiBaseUrl, search),
    staleTime: 30_000,
  });
