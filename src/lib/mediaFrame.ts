export interface MediaFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

export const calculateContainedMediaRect = (
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number,
): MediaFrameRect => {
  if (
    !isPositiveFinite(containerWidth) ||
    !isPositiveFinite(containerHeight) ||
    !isPositiveFinite(mediaWidth) ||
    !isPositiveFinite(mediaHeight)
  ) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const scale = Math.min(containerWidth / mediaWidth, containerHeight / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;

  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
};
