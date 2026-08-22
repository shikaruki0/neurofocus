/**
 * Branded in-app confirmation dialog — replaces browser `confirm()` / `alert()`.
 *
 * Chrome's native dialogs look nothing like the app, block the whole page, and
 * can't be themed or translated. This module renders a premium, accessible modal
 * that matches the existing design system (`.overlay.center` / `.modal`) and
 * resolves a Promise so callers keep their existing "if confirmed, continue"
 * control flow.
 *
 * Accessibility:
 *  - role="dialog" + aria-modal, labelled by the title.
 *  - Focus moves into the dialog, is trapped between its buttons, and returns
 *    to the previously focused element on close.
 *  - Escape and backdrop click cancel; Enter/click confirm.
 *  - Message is inserted via textContent, never innerHTML (no XSS).
 */

export interface ConfirmDialogOptions {
  /** Bold heading shown at the top of the dialog. */
  title: string;
  /** Body text. May contain user-visible data; inserted as plain text. */
  message: string;
  /** Label for the affirmative button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the dismiss button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Styles the affirmative button as destructive and focuses Cancel by default. */
  danger?: boolean;
}

const CONFIRM_BTN_CLASS = 'nf-confirm-confirm-btn';
const CANCEL_BTN_CLASS = 'nf-confirm-cancel-btn';

/** Renders a branded confirmation dialog and resolves true on confirm, false otherwise. */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const title = options.title || 'Are you sure?';
  const message = options.message || '';
  const confirmLabel = options.confirmLabel || 'Confirm';
  const cancelLabel = options.cancelLabel || 'Cancel';

  return new Promise<boolean>((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    let settled = false;

    const overlay = document.createElement('div');
    overlay.className = 'overlay center nf-confirm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'nf-confirm-title');

    const modal = document.createElement('div');
    modal.className = 'modal nf-confirm-modal';

    const titleEl = document.createElement('div');
    titleEl.className = 'modal-title nf-confirm-title';
    titleEl.id = 'nf-confirm-title';
    titleEl.textContent = title;

    const messageEl = document.createElement('p');
    messageEl.className = 'nf-confirm-message';
    messageEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'nf-confirm-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `btn ${CONFIRM_BTN_CLASS}${options.danger ? ' btn-danger' : ''}`;
    confirmBtn.textContent = confirmLabel;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = `btn btn-ghost ${CANCEL_BTN_CLASS}`;
    cancelBtn.textContent = cancelLabel;

    actions.append(confirmBtn, cancelBtn);
    modal.append(titleEl, messageEl, actions);
    overlay.append(modal);

    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      // Restore focus to whatever the user was interacting with before.
      previouslyFocused?.focus?.();
      resolve(result);
    };

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
        return;
      }
      if (event.key !== 'Tab') return;
      // Trap focus between the two buttons (the only focusable controls).
      const focusables = [confirmBtn, cancelBtn];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    confirmBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(false);
    });
    document.addEventListener('keydown', onKeydown);

    document.body.append(overlay);
    // Trigger the reveal transition on the next frame when available.
    const show = (): void => overlay.classList.add('show');
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(show);
    else show();
    // Dangerous actions focus Cancel so a stray Enter can't destroy data.
    (options.danger ? cancelBtn : confirmBtn).focus();
  });
}
