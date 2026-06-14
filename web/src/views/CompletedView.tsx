import { useTasks } from "../queries";
import { Page, ListBody } from "./View";

export function CompletedView() {
  const q = useTasks("completed", { view: "completed" });
  return (
    <Page title="Completed" subtitle="Recently done & cancelled">
      <ListBody loading={q.isLoading} tasks={q.data} empty={{ title: "Nothing completed yet", hint: "Done and cancelled tasks land here. Click a checkbox to bring one back." }} />
    </Page>
  );
}
