import { useTasks } from "../queries";
import { Page, ListBody } from "./View";

export function AllView() {
  const q = useTasks("all", { sort: "due" });
  return (
    <Page title="All open" subtitle={q.data ? `${q.data.length} open` : undefined}>
      <ListBody loading={q.isLoading} tasks={q.data} empty={{ title: "No open tasks", hint: "Everything's done. 🎉" }} />
    </Page>
  );
}
