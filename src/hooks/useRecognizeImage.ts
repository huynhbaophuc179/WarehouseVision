import { useMutation } from "@tanstack/react-query";
import { recognizeImage } from "@/lib/api";
import type { RecognizeImageInput } from "@/lib/api";
import type { DetectionResult } from "@/types/api";

export const useRecognizeImage = (apiBaseUrl: string) =>
  useMutation<DetectionResult[], Error, RecognizeImageInput>({
    mutationFn: (input) => recognizeImage(apiBaseUrl, input),
  });
