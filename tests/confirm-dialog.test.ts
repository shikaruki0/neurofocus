import { describe, it, expect, beforeEach } from 'vitest';
import { confirmDialog } from '../src/modules/confirmDialog.ts';

function overlay(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.nf-confirm-overlay');
}

describe('confirmDialog (branded confirm modal)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a dialog and resolves true on confirm', async () => {
    const promise = confirmDialog({ title: 'Delete?', message: 'Are you sure?' });

    const el = overlay();
    expect(el).not.toBeNull();
    expect(el!.getAttribute('role')).toBe('dialog');
    expect(el!.getAttribute('aria-modal')).toBe('true');
    expect(el!.textContent).toContain('Delete?');
    expect(el!.textContent).toContain('Are you sure?');

    (el!.querySelector('.nf-confirm-confirm-btn') as HTMLButtonElement).click();
    await expect(promise).resolves.toBe(true);
    expect(overlay()).toBeNull(); // cleaned up
  });

  it('resolves false on cancel', async () => {
    const promise = confirmDialog({ title: 'x', message: 'y' });
    (overlay()!.querySelector('.nf-confirm-cancel-btn') as HTMLButtonElement).click();
    await expect(promise).resolves.toBe(false);
  });

  it('resolves false on Escape', async () => {
    const promise = confirmDialog({ title: 'x', message: 'y' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(promise).resolves.toBe(false);
  });

  it('uses textContent for the message (no HTML injection)', async () => {
    const promise = confirmDialog({
      title: 'x',
      message: '<img src=x onerror=alert(1)> & other stuff',
    });
    const messageEl = overlay()!.querySelector<HTMLElement>('.nf-confirm-message')!;
    expect(messageEl.textContent).toBe('<img src=x onerror=alert(1)> & other stuff');
    // The literal markup must NOT have been parsed into an element.
    expect(messageEl.querySelector('img')).toBeNull();

    (overlay()!.querySelector('.nf-confirm-confirm-btn') as HTMLButtonElement).click();
    await promise;
  });

  it('focuses Cancel by default for dangerous actions', () => {
    void confirmDialog({ title: 'x', message: 'y', danger: true });
    const cancelBtn = overlay()!.querySelector<HTMLButtonElement>('.nf-confirm-cancel-btn')!;
    expect(document.activeElement).toBe(cancelBtn);
  });
});
