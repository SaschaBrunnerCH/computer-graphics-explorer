import { Navigate, useParams } from "react-router-dom";
import { termById } from "../data";
import { usePageMeta } from "../lib/meta";
import { TermArticle } from "../components/TermArticle";

export function TermPage(): React.JSX.Element {
  const { termId } = useParams();
  const term = termId ? termById.get(termId) : undefined;

  usePageMeta(term?.title, term?.explanation.split(". ")[0]);

  if (!term) {
    return <Navigate to="/not-found" replace />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <TermArticle term={term} />
    </div>
  );
}
