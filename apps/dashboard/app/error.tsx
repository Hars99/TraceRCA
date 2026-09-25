"use client";

import { useEffect } from "react";
import { ErrorState } from "../components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-shell page-centered">
      <ErrorState title="Dashboard surface failed" detail="The page could not render the live TraceRCA response." />
      <button className="button secondary-button" onClick={() => reset()}>Try again</button>
    </div>
  );
}
