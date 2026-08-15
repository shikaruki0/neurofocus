import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enhancePremiumSelect } from '../src/modules/premiumSelect.ts';

describe('premium in-app select', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <label for="topic">Topic</label>
      <select id="topic">
        <option value="physics">Physics</option>
        <option value="chemistry">Chemistry</option>
        <option value="biology">Biology</option>
      </select>`;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the native select as source of truth while opening a branded dialog', () => {
    const select = document.querySelector<HTMLSelectElement>('#topic')!;
    enhancePremiumSelect(select, { title: 'Choose your focus topic' });

    const trigger = document.querySelector<HTMLButtonElement>('.premium-select-trigger')!;
    expect(trigger.textContent).toContain('Physics');
    expect(select.classList.contains('premium-select-native')).toBe(true);

    trigger.click();
    const overlay = document.querySelector<HTMLElement>('.premium-select-overlay')!;
    expect(overlay.classList.contains('show')).toBe(true);
    expect(overlay.getAttribute('aria-hidden')).toBe('false');
    expect(document.querySelector('.premium-select-title')?.textContent).toBe(
      'Choose your focus topic',
    );
  });

  it('selects an option, emits the normal change event, and updates the trigger', () => {
    const select = document.querySelector<HTMLSelectElement>('#topic')!;
    const onChange = vi.fn();
    select.addEventListener('change', onChange);
    enhancePremiumSelect(select, { title: 'Choose a topic' });

    document.querySelector<HTMLButtonElement>('.premium-select-trigger')!.click();
    document
      .querySelector<HTMLButtonElement>('.premium-select-option[data-value="chemistry"]')!
      .click();

    expect(select.value).toBe('chemistry');
    expect(onChange).toHaveBeenCalledOnce();
    expect(document.querySelector('.premium-select-value')?.textContent).toBe('Chemistry');
    expect(document.querySelector('.premium-select-overlay')?.classList.contains('show')).toBe(
      false,
    );
  });

  it('searches long topic lists and closes with Escape', () => {
    const select = document.querySelector<HTMLSelectElement>('#topic')!;
    for (let index = 1; index <= 8; index += 1) {
      select.add(new Option(`Chapter ${index}`, `chapter-${index}`));
    }
    enhancePremiumSelect(select, {
      title: 'Choose a topic',
      searchPlaceholder: 'Search topics',
    });

    document.querySelector<HTMLButtonElement>('.premium-select-trigger')!.click();
    const search = document.querySelector<HTMLInputElement>('.premium-select-search')!;
    expect(search.hidden).toBe(false);
    search.value = 'Chapter 8';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const visible = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.premium-select-option'),
    ).filter((option) => !option.hidden);
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain('Chapter 8');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.premium-select-overlay')?.classList.contains('show')).toBe(
      false,
    );
  });

  it('mirrors disabled state and supports associated labels', async () => {
    const select = document.querySelector<HTMLSelectElement>('#topic')!;
    enhancePremiumSelect(select, { title: 'Choose a topic' });
    const trigger = document.querySelector<HTMLButtonElement>('.premium-select-trigger')!;

    document.querySelector<HTMLLabelElement>('label')!.click();
    expect(document.querySelector('.premium-select-overlay')?.classList.contains('show')).toBe(
      true,
    );

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    select.disabled = true;
    await Promise.resolve();
    expect(trigger.disabled).toBe(true);
  });
});
