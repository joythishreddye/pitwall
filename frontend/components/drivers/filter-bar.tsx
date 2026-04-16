"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortKey = "points" | "wins" | "name";

export interface FilterState {
  team: string;    // "" = all teams
  nationality: string;  // "" = all nationalities
  sort: SortKey;
}

interface FilterBarProps {
  filter: FilterState;
  teams: string[];         // All distinct team names from current data
  nationalities: string[]; // All distinct nationalities
  onChange: (next: FilterState) => void;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "points", label: "Points" },
  { value: "wins", label: "Wins" },
  { value: "name", label: "Name" },
];

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex items-center gap-1.5 border border-f1-grid bg-f1-dark-2 px-3 h-8">
      <span className="text-[9px] font-mono uppercase tracking-widest text-f1-muted/60 select-none">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "bg-transparent text-f1-text text-xs font-mono appearance-none cursor-pointer",
          "focus:outline-none pr-4 min-w-0"
        )}
        aria-label={label}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-f1-dark-2">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="h-3 w-3 text-f1-muted/60 absolute right-2 pointer-events-none" />
    </div>
  );
}

export function FilterBar({ filter, teams, nationalities, onChange }: FilterBarProps) {
  const teamOptions = [
    { value: "", label: "ALL TEAMS" },
    ...teams.map((t) => ({ value: t, label: t.toUpperCase() })),
  ];

  const natOptions = [
    { value: "", label: "ALL" },
    ...nationalities.map((n) => ({ value: n, label: n.toUpperCase() })),
  ];

  const sortOptions = SORT_OPTIONS.map((s) => ({
    value: s.value,
    label: s.label.toUpperCase(),
  }));

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <Select
        label="TEAM"
        value={filter.team}
        options={teamOptions}
        onChange={(v) => onChange({ ...filter, team: v })}
      />
      <Select
        label="NAT"
        value={filter.nationality}
        options={natOptions}
        onChange={(v) => onChange({ ...filter, nationality: v })}
      />
      <Select
        label="SORT"
        value={filter.sort}
        options={sortOptions}
        onChange={(v) => onChange({ ...filter, sort: v as SortKey })}
      />
    </div>
  );
}
