import { useTasks } from "../queries";
import { Page, ListBody } from "./View";

export function TodayView() {
  const q = useTasks("today", { view: "today" });
  const d = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <Page title="Today" subtitle={d}>
      <ListBody loading={q.isLoading} tasks={q.data} empty={{ title: "Nothing due today", hint: "Overdue and due-today tasks land here." }} />
    </Page>
  );
}
