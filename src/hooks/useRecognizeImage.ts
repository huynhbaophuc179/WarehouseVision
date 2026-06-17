import { useMutation } from "@tanstack/react-query";
import { recognizeImage } from "@/lib/api";
import type { DetectionResult } from "@/types/api";

export const useRecognizeImage = (apiBaseUrl: string) =>
  useMutation<DetectionResult[], Error, File>({
    mutationFn: (file) => recognizeImage(apiBaseUrl, file),
  });
