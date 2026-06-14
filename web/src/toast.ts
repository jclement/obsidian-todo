export type ToastKind = "info" | "success" | "error";
export interface ToastMsg {
  id: number;
  message: string;
  kind: ToastKind;
}

let seq = 1;
export function toast(message: string, kind: ToastKind = "info") {
  window.dispatchEvent(new CustomEvent<ToastMsg>("toast", { detail: { id: seq++, message, kind } }));
}
