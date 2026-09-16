import { Skeleton as AntSkeleton } from "antd";

export interface SkeletonProps { className?: string }
export const Skeleton = ({ className }: SkeletonProps): JSX.Element => (
  <div className={className} aria-label="Đang tải">
    <AntSkeleton.Node active style={{ width: "100%", height: "100%", minHeight: 16 }} />
  </div>
);
