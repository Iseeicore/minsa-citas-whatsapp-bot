type ModalDialog = { open: boolean; showModal: () => void; close: () => void };
type Focusable = { focus: () => void };

export function openModalDialog(dialog: ModalDialog, opener: Focusable | null): () => void {
  if (!dialog.open) dialog.showModal();
  return () => {
    if (dialog.open) dialog.close();
    opener?.focus();
  };
}
