import { cn } from "@/lib/utils";

export interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className }: SkeletonProps): JSX.Element => (
  <div className={cn("animate-pulse rounded-md bg-slate-200", className)} />
);
