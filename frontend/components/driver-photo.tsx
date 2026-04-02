"use client";

import { useState } from "react";

export function DriverPhoto({
  src,
  forename,
  surname,
  teamColor,
  size = 48,
}: {
  src: string | null;
  forename: string;
  surname: string;
  teamColor: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials = `${forename?.[0] ?? "?"}${surname?.[0] ?? "?"}`;

  if (!src || failed) {
    return (
      <div
        className="rounded-sm flex items-center justify-center font-mono font-bold text-f1-dark shrink-0"
        style={{
          width: size,
          height: size,
          backgroundColor: teamColor,
          fontSize: size * 0.35,
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${forename} ${surname}`}
      className="rounded-sm object-cover shrink-0"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
