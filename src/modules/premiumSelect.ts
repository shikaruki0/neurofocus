/**
 * Branded, accessible replacement UI for native study selects.
 *
 * The original <select> remains the source of truth so forms, validation, and
 * existing feature logic continue to work. Users interact with an in-app
 * bottom sheet instead of a browser-owned picker.
 */

export interface PremiumSelectConfig {
  title: string;
  kicker?: string;
  searchPlaceholder?: string;
  searchThreshold?: number;
}

export interface PremiumSelectController {
  sync: () => void;
  destroy: () => void;
}

interface ActivePicker {
  select: HTMLSelectElement;
  trigger: HTMLButtonElement;
  config: PremiumSelectConfig;
}

const DEFAULT_KICKER = 'NEUROFOCUS PICKER';
let activePicker: ActivePicker | null = null;
let pickerOverlay: HTMLElement | null = null;
let pickerList: HTMLElement | null = null;
let pickerSearch: HTMLInputElement | null = null;
let pickerEmpty: HTMLElement | null = null;

function optionLabel(option: HTMLOptionElement | undefined): string {
  return option?.textContent?.trim() || 'Choose an option';
}

function enabledOptions(select: HTMLSelectElement): HTMLOptionElement[] {
  return Array.from(select.options).filter((option) => !option.disabled && !option.hidden);
}

function syncTrigger(select: HTMLSelectElement, trigger: HTMLButtonElement): void {
  trigger.querySelector<HTMLElement>('.premium-select-value')!.textContent = optionLabel(
    select.selectedOptions[0],
  );
  trigger.disabled = select.disabled;
  trigger.setAttribute('aria-disabled', String(select.disabled));
}

function closePicker(restoreFocus = true): void {
  if (!pickerOverlay || !activePicker) return;
  const trigger = activePicker.trigger;
  pickerOverlay.classList.remove('show');
  pickerOverlay.setAttribute('aria-hidden', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  activePicker = null;
  if (restoreFocus) trigger.focus();
}

function filterOptions(query: string): void {
  if (!pickerList || !pickerEmpty) return;
  const normalized = query.trim().toLocaleLowerCase();
  let visible = 0;
  pickerList.querySelectorAll<HTMLButtonElement>('.premium-select-option').forEach((button) => {
    const match =
      !normalized || (button.textContent || '').toLocaleLowerCase().includes(normalized);
    button.hidden = !match;
    if (match) visible += 1;
  });
  pickerEmpty.hidden = visible > 0;
}

function renderOptions(): void {
  if (!activePicker || !pickerList || !pickerSearch || !pickerEmpty) return;
  const { select, config } = activePicker;
  const list = pickerList;
  const search = pickerSearch;
  const empty = pickerEmpty;
  const options = enabledOptions(select);
  list.textContent = '';

  options.forEach((option) => {
    const selected = option.value === select.value;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'premium-select-option';
    button.dataset.value = option.value;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(selected));

    const label = document.createElement('span');
    label.className = 'premium-select-option-label';
    label.textContent = optionLabel(option);

    const check = document.createElement('span');
    check.className = 'premium-select-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = selected ? '✓' : '';

    button.append(label, check);
    button.addEventListener('click', () => {
      if (!activePicker) return;
      const targetSelect = activePicker.select;
      if (targetSelect.value !== option.value) {
        targetSelect.value = option.value;
        targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      closePicker();
    });
    list.append(button);
  });

  const threshold = config.searchThreshold ?? 8;
  const showSearch = options.length >= threshold;
  search.hidden = !showSearch;
  search.value = '';
  search.placeholder = config.searchPlaceholder || 'Search topics';
  empty.hidden = true;
}

function focusableElements(): HTMLElement[] {
  if (!pickerOverlay) return [];
  return Array.from(
    pickerOverlay.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden])',
    ),
  ).filter((element) => element.getClientRects().length > 0 || element === document.activeElement);
}

function handlePickerKeydown(event: KeyboardEvent): void {
  if (!activePicker) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closePicker();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = focusableElements();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function ensurePicker(): HTMLElement {
  if (pickerOverlay?.isConnected) return pickerOverlay;

  const overlay = document.createElement('div');
  overlay.className = 'premium-select-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <section class="premium-select-sheet" role="dialog" aria-modal="true" aria-labelledby="premium-select-title">
      <div class="premium-select-handle" aria-hidden="true"></div>
      <header class="premium-select-header">
        <div>
          <p class="premium-select-kicker"></p>
          <h2 id="premium-select-title" class="premium-select-title"></h2>
        </div>
        <button class="premium-select-close" type="button" aria-label="Close picker">×</button>
      </header>
      <div class="premium-select-search-wrap">
        <span aria-hidden="true">⌕</span>
        <input class="premium-select-search" type="search" autocomplete="off" />
      </div>
      <div class="premium-select-list" role="listbox"></div>
      <p class="premium-select-empty" hidden>No matching topics found.</p>
    </section>`;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closePicker();
  });
  overlay
    .querySelector<HTMLButtonElement>('.premium-select-close')!
    .addEventListener('click', () => closePicker());

  pickerOverlay = overlay;
  pickerList = overlay.querySelector<HTMLElement>('.premium-select-list');
  pickerSearch = overlay.querySelector<HTMLInputElement>('.premium-select-search');
  pickerEmpty = overlay.querySelector<HTMLElement>('.premium-select-empty');
  pickerSearch?.addEventListener('input', () => filterOptions(pickerSearch?.value || ''));
  document.addEventListener('keydown', handlePickerKeydown);
  document.body.append(overlay);
  return overlay;
}

function openPicker(active: ActivePicker): void {
  if (active.select.disabled) return;
  const overlay = ensurePicker();
  activePicker = active;

  overlay.querySelector<HTMLElement>('.premium-select-kicker')!.textContent =
    active.config.kicker || DEFAULT_KICKER;
  overlay.querySelector<HTMLElement>('.premium-select-title')!.textContent = active.config.title;
  renderOptions();

  active.trigger.setAttribute('aria-expanded', 'true');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('show');

  const selected = pickerList?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
  if (pickerSearch && !pickerSearch.hidden) pickerSearch.focus();
  else (selected || pickerList?.querySelector<HTMLButtonElement>('button'))?.focus();
}

export function enhancePremiumSelect(
  select: HTMLSelectElement,
  config: PremiumSelectConfig,
): PremiumSelectController {
  const existing = select.nextElementSibling;
  if (existing?.classList.contains('premium-select-control')) {
    return { sync: () => undefined, destroy: () => undefined };
  }

  const control = document.createElement('div');
  control.className = 'premium-select-control';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'premium-select-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', config.title);
  trigger.innerHTML = `
    <span class="premium-select-value"></span>
    <span class="premium-select-chevron" aria-hidden="true">⌄</span>`;
  control.append(trigger);

  select.classList.add('premium-select-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.insertAdjacentElement('afterend', control);

  const sync = () => syncTrigger(select, trigger);
  const open = () => openPicker({ select, trigger, config });
  const handleLabelClick = (event: Event) => {
    event.preventDefault();
    trigger.focus();
    open();
  };
  const labels = Array.from(select.labels || []);

  trigger.addEventListener('click', open);
  select.addEventListener('change', sync);
  labels.forEach((label) => label.addEventListener('click', handleLabelClick));

  const observer = new MutationObserver(sync);
  observer.observe(select, {
    attributes: true,
    attributeFilter: ['class', 'disabled'],
    childList: true,
    subtree: true,
  });
  sync();

  return {
    sync,
    destroy: () => {
      if (activePicker?.select === select) closePicker(false);
      observer.disconnect();
      trigger.removeEventListener('click', open);
      select.removeEventListener('change', sync);
      labels.forEach((label) => label.removeEventListener('click', handleLabelClick));
      control.remove();
      select.classList.remove('premium-select-native');
      select.removeAttribute('aria-hidden');
      select.removeAttribute('tabindex');
    },
  };
}
