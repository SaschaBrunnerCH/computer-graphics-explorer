import { Link } from "react-router-dom";
import { usePageMeta } from "../lib/meta";

export function NotFoundPage(): React.JSX.Element {
  usePageMeta("Page not found");
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="text-6xl" aria-hidden="true">
        🫥
      </p>
      <h1 className="mt-4 text-2xl font-bold text-[var(--calcite-color-text-1)]">
        This page got culled
      </h1>
      <p className="mt-2 text-[var(--calcite-color-text-2)]">
        Like a triangle outside the view frustum, the page you asked for isn't being rendered.
      </p>
      <p className="mt-6">
        <Link to="/" className="text-[var(--calcite-color-brand)]">
          Back to the exhibit entrance →
        </Link>
      </p>
    </div>
  );
}
