"use client";

import { createContext, useContext } from "react";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";

interface TeamColorContextValue {
  team: string;
  /** CSS variable reference, e.g. "var(--color-team-ferrari)" */
  cssVar: string;
  /** Hex value, e.g. "#E8002D" */
  hex: string;
}

const TeamColorContext = createContext<TeamColorContextValue | null>(null);

interface TeamColorProviderProps {
  team: string;
  children: React.ReactNode;
  className?: string;
}

export function TeamColorProvider({
  team,
  children,
  className,
}: TeamColorProviderProps) {
  const hex = getTeamHexColor(team);
  const cssVar = getTeamColor(team);

  const value: TeamColorContextValue = { team, cssVar, hex };

  return (
    <TeamColorContext.Provider value={value}>
      {/* Sets --team-color on the DOM so children can use var(--team-color) in CSS/inline styles */}
      <div
        className={className}
        style={
          {
            "--team-color": hex,
            "--team-color-var": cssVar,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </TeamColorContext.Provider>
  );
}

export function useTeamColor(): TeamColorContextValue | null {
  return useContext(TeamColorContext);
}
