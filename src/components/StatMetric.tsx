import { Card, CardContent } from "@/components/ui/card";

export interface StatMetricProps {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning";
}

export const StatMetric = ({ label, value, tone = "default" }: StatMetricProps): JSX.Element => {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-content";

  return (
    <Card className="border-line">
      <CardContent className="p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
};
