import { describe, expect, it, vi } from "vitest";
import { isBackdropClick, openModalDialog } from "@/lib/utils/modal-dialog";

function fakeDialog(open = false) {
  const dialog = {
    open,
    showModal: vi.fn(() => {
      dialog.open = true;
    }),
    close: vi.fn(() => {
      dialog.open = false;
    }),
  };
  return dialog;
}

describe("openModalDialog", () => {
  it("opens the dialog as modal so the page behind is inert and Tab stays inside", () => {
    const dialog = fakeDialog();

    openModalDialog(dialog, null);

    expect(dialog.showModal).toHaveBeenCalledTimes(1);
  });

  it("does not open it twice", () => {
    const dialog = fakeDialog(true);

    openModalDialog(dialog, null);

    expect(dialog.showModal).not.toHaveBeenCalled();
  });

  it("on cleanup closes the dialog and gives the focus back to the control that opened it", () => {
    const dialog = fakeDialog();
    const opener = { focus: vi.fn() };

    openModalDialog(dialog, opener)();

    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(opener.focus).toHaveBeenCalledTimes(1);
  });
});

describe("isBackdropClick", () => {
  it("is true only when the click lands on the dialog itself, outside its content", () => {
    const dialog = {};

    expect(isBackdropClick({ target: dialog, currentTarget: dialog })).toBe(true);
    expect(isBackdropClick({ target: {}, currentTarget: dialog })).toBe(false);
  });
});
