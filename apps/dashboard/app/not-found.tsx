import Link from "next/link";
import { ErrorState } from "../components/ui";

export default function NotFound() {
  return (
    <div className="page-shell page-centered">
      <ErrorState title="Record not found" detail="TraceRCA did not return the requested record." />
      <Link className="button secondary-button" href="/">Return to operations</Link>
    </div>
  );
}
