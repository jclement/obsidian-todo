import { useParams } from "react-router-dom";
import { useTasks } from "../queries";
import { Page, ListBody } from "./View";

export function TagView() {
  const { tag = "" } = useParams();
  const q = useTasks("tag:" + tag, { tag, sort: "due" });
  return (
    <Page title={`#${tag}`} subtitle={q.data ? `${q.data.length} open` : undefined}>
      <ListBody loading={q.isLoading} tasks={q.data} empty={{ title: `No open tasks tagged #${tag}` }} />
    </Page>
  );
}
