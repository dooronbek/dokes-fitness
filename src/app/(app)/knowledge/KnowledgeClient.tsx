"use client";

import { useState } from "react";
import type { DossierStats, PersonalRecord, UserProfile } from "@/lib/types";
import ProfileSection from "./ProfileSection";
import PRsSection from "./PRsSection";
import StatsSection from "./StatsSection";

export default function KnowledgeClient({
  initialProfile,
  initialPRs,
  initialStats,
}: {
  initialProfile: UserProfile | null;
  initialPRs: PersonalRecord[];
  initialStats: DossierStats;
}) {
  const [prs, setPRs] = useState<PersonalRecord[]>(initialPRs);

  return (
    <div className="flex flex-col gap-8">
      <ProfileSection initial={initialProfile} />
      <PRsSection prs={prs} onChange={setPRs} />
      <StatsSection initial={initialStats} />
    </div>
  );
}
