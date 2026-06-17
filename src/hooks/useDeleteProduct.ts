import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteProduct } from "@/lib/api";
import type { ProductDeleteResponse } from "@/types/api";

export interface DeleteProductVariables {
  apiBaseUrl: string;
  productId: string;
}

export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  return useMutation<ProductDeleteResponse, Error, DeleteProductVariables>({
    mutationFn: ({ apiBaseUrl, productId }) => deleteProduct(apiBaseUrl, productId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["product-detail"] });
    },
  });
};
