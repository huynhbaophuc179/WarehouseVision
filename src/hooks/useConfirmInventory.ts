import { useMutation } from "@tanstack/react-query";
import { confirmInventory } from "@/lib/api";
import type { InventoryConfirmRequest, InventoryConfirmResponse } from "@/types/api";

export const useConfirmInventory = (apiBaseUrl: string) =>
  useMutation<InventoryConfirmResponse, Error, InventoryConfirmRequest>({
    mutationFn: (payload) => confirmInventory(apiBaseUrl, payload),
  });
