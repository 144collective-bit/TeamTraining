"use client";

import { useEffect, useState } from "react";

/**
 * Captures the browser's clock at submit time.
 *
 * The server records its own timestamp regardless; this is the *asserted* time,
 * which is what makes a late offline sync visible on the record instead of
 * silently passing as contemporaneous. Rendered empty on the server so the
 * markup matches before hydration.
 */
export function DeviceClock({ name = "occurredAt" }: { name?: string }) {
  const [now, setNow] = useState("");

  useEffect(() => {
    const tick = () => setNow(new Date().toISOString());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return <input type="hidden" name={name} value={now} />;
}
