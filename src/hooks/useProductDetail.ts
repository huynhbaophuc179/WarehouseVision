import { useQuery } from "@tanstack/react-query";
import { fetchProductDetail } from "@/lib/api";
import type { ProductDetail } from "@/types/api";

export const useProductDetail = (apiBaseUrl: string, productId: string | null) =>
  useQuery<ProductDetail, Error>({
    queryKey: ["product-detail", apiBaseUrl, productId],
    queryFn: () => fetchProductDetail(apiBaseUrl, productId ?? ""),
    enabled: Boolean(productId),
    staleTime: 30_000,
  });
