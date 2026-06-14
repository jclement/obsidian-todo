import { useTasks } from "../queries";
import { Page, ListBody } from "./View";

export function InboxView() {
  const q = useTasks("inbox", { view: "inbox" });
  return (
    <Page title="Inbox" subtitle="Untriaged capture">
      <ListBody loading={q.isLoading} tasks={q.data} empty={{ title: "Inbox zero", hint: "New quick-adds without a project land here." }} />
    </Page>
  );
}
