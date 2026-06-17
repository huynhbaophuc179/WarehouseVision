import { Card, CardContent } from "@/components/ui/card";

export interface StatMetricProps {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning";
}

export const StatMetric = ({ label, value, tone = "default" }: StatMetricProps): JSX.Element => {
  const toneClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : "text-slate-950";

  return (
    <Card className="border-slate-200">
      <CardContent className="p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
};
