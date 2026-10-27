/**
 * Flap on pointer *down* (never on click or release, which feel late), from any finger or
 * mouse button on the play area, or from Space / ↑ / W / Enter. Holding any of them is
 * "held" (pelican glide).
 */
export interface InputActions {
  press(): void;
  hold(held: boolean): void;
  pause(): void;
  mute(): void;
  retry(): void;
}

const FLAP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter']);

export function bindInput(area: HTMLElement, actions: InputActions): void {
  const pointers = new Set<number>();
  const keys = new Set<string>();
  const sync = () => actions.hold(pointers.size > 0 || keys.size > 0);

  area.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    pointers.add(ev.pointerId);
    try {
      area.setPointerCapture(ev.pointerId);
    } catch {
      /* not capturable */
    }
    actions.press();
    sync();
  });
  const up = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId);
    sync();
  };
  area.addEventListener('pointerup', up);
  area.addEventListener('pointercancel', up);
  area.addEventListener('lostpointercapture', up);
  area.addEventListener('contextmenu', (ev) => ev.preventDefault());

  window.addEventListener('keydown', (ev) => {
    const target = ev.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
    if (FLAP_KEYS.has(ev.code)) {
      // Space/Enter on a focused button or link (the arcade link on the title) activates it instead:
      // no flap, and no preventDefault, which would cancel the link's navigation.
      if ((ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'NumpadEnter') && (tag === 'BUTTON' || tag === 'A')) return;
      ev.preventDefault();
      if (!ev.repeat) {
        keys.add(ev.code);
        actions.press();
        sync();
      }
      return;
    }
    if (ev.repeat) return;
    if (ev.code === 'KeyP' || ev.code === 'Escape') actions.pause();
    else if (ev.code === 'KeyM') actions.mute();
    else if (ev.code === 'KeyR') actions.retry();
  });
  window.addEventListener('keyup', (ev) => {
    if (keys.delete(ev.code)) sync();
  });
  window.addEventListener('blur', () => {
    pointers.clear();
    keys.clear();
    sync();
  });
}
