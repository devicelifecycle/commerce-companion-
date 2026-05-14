import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type LatestRun = {
  marketplace: string;
  status: string;
  started_at: string;
  error_message: string | null;
};

const STALE_HOURS = 12;
const TRACKED = ["amazon", "shopify", "bestbuy"] as const;

async function fetchLatestRuns(): Promise<LatestRun[]> {
  const { data, error } = await supabase
    .from("sync_logs")
    .select("marketplace,status,started_at,error_message")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const latest = new Map<string, LatestRun>();
  for (const row of data || []) {
    if (!latest.has(row.marketplace)) {
      latest.set(row.marketplace, row as LatestRun);
    }
  }
  return Array.from(latest.values());
}

export function IntegrationHealthBanner() {
  const { data } = useQuery({
    queryKey: ["integration-health-banner"],
    queryFn: fetchLatestRuns,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (!data) return null;

  const now = Date.now();
  const issues: { marketplace: string; reason: string }[] = [];

  for (const mp of TRACKED) {
    const run = data.find((r) => r.marketplace === mp);
    if (!run) {
      issues.push({ marketplace: mp, reason: "no sync runs recorded" });
      continue;
    }
    const ageHrs = (now - new Date(run.started_at).getTime()) / 3_600_000;
    if (run.status === "error" || run.status === "partial") {
      issues.push({
        marketplace: mp,
        reason: run.error_message
          ? `last sync ${run.status}: ${run.error_message.slice(0, 120)}`
          : `last sync ${run.status}`,
      });
    } else if (ageHrs > STALE_HOURS) {
      issues.push({
        marketplace: mp,
        reason: `no successful sync in ${Math.floor(ageHrs)}h`,
      });
    }
  }

  if (issues.length === 0) return null;

  return (
    <div className="sticky top-0 z-50 border-b border-destructive/40 bg-destructive/15 backdrop-blur supports-[backdrop-filter]:bg-destructive/10">
      <div className="px-4 py-2 flex items-center gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-destructive mr-2">
            Integration {issues.length === 1 ? "issue" : "issues"} detected:
          </span>
          <span className="text-foreground/90">
            {issues
              .map((i) => `${i.marketplace.toUpperCase()} — ${i.reason}`)
              .join(" · ")}
          </span>
        </div>
        <Link
          to="/integration-health"
          className="inline-flex items-center gap-1 font-semibold text-destructive hover:underline shrink-0"
        >
          Fix now <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
