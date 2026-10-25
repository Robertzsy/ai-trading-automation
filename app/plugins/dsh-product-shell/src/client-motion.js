const ProductPageActivity = react.createContext(true);
const useProductPageActive = () => react.useContext(ProductPageActivity);
const productMotion = (() => {
  const listeners = new Set();
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let preference = 'system', revision = 0;
  try { preference = localStorage.getItem('ata.ui.motion') || 'system'; } catch {}
  if (!['system','standard','off'].includes(preference)) preference = 'system';
  let snapshot;
  const update = () => {
    const reduced = preference === 'off' || Boolean(media?.matches);
    snapshot = Object.freeze({ preference, reduced, revision: ++revision });
    if (typeof document !== 'undefined' && document.body) document.body.dataset.ataMotion = reduced ? 'off' : 'standard';
    listeners.forEach(listener => listener());
  };
  update();
  media?.addEventListener('change', update);
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    set(value) {
      if (!['system','standard','off'].includes(value) || value === preference) return;
      preference = value;
      try { localStorage.setItem('ata.ui.motion', value); } catch {}
      update();
    }
  };
})();
const useProductMotion = () => react.useSyncExternalStore(productMotion.subscribe, productMotion.getSnapshot, productMotion.getSnapshot);

function useMotionPresence(open, distance = 6, axis = 'Y') {
  const ref = react.useRef(null);
  const controller = react.useRef(null);
  if (!controller.current) controller.current = createMotionController();
  const [present, setPresent] = react.useState(open);
  const motion = useProductMotion();
  react.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.inert = !open;
    if (open) {
      element.hidden = false;
      setPresent(true);
      controller.current.play(element, [{ opacity: 0, transform: `translate${axis}(${distance}px)` }, { opacity: 1, transform: 'none' }], motion.reduced ? 0 : 200);
    } else if (present) {
      controller.current.play(element, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate${axis}(${distance / 2}px)` }], motion.reduced ? 0 : 140, () => { element.hidden = true; setPresent(false); });
    }
    return () => controller.current.cancel();
  }, [open, motion.revision]);
  return { ref, present, hidden: !open && !present };
}

function MotionPage({ active, page, children }) {
  const presence = useMotionPresence(active);
  return react.createElement(ProductPageActivity.Provider, { value: active },
    react.createElement('div', {
      ref: presence.ref, className: 'ia-shell-page', hidden: presence.hidden,
      'data-page': page, 'data-active': active, 'aria-hidden': !active,
      style: active ? undefined : { position: 'absolute', inset: 0, pointerEvents: 'none' }
    }, children));
}

function MotionPresence({ open, className, children }) {
  const presence = useMotionPresence(open, 12, 'X');
  return react.createElement('div', { ref: presence.ref, className, hidden: presence.hidden, 'aria-hidden': !open }, open || presence.present ? children : null);
}

function useAnimatedProductDialog(ref, open, onClose) {
  const active = useProductPageActive(), motion = useProductMotion();
  const close = react.useRef(onClose), opener = react.useRef(null), controller = react.useRef(null);
  close.current = onClose;
  if (!controller.current) controller.current = createMotionController();
  react.useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!active) {
      controller.current.cancel();
      if (dialog.open) dialog.close();
      if (open) close.current?.();
      return;
    }
    if (open) {
      if (!dialog.open) { opener.current = document.activeElement; dialog.showModal(); }
      dialog.dataset.closing = 'false';
      controller.current.play(dialog, [{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], motion.reduced ? 0 : 220);
    } else if (dialog.open) {
      dialog.dataset.closing = 'true';
      controller.current.play(dialog, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(12px)' }], motion.reduced ? 0 : 160, () => {
        dialog.close();
        if (opener.current?.isConnected && opener.current.getClientRects().length) opener.current.focus();
        else document.querySelector('.ia-navbtn[data-active=true]')?.focus();
      });
    }
    return () => controller.current.cancel();
  }, [open, active, motion.revision]);
  react.useEffect(() => () => { if (ref.current?.open) ref.current.close(); }, []);
}

function ProductModal({ open, busy, onClose, label, children }) {
  const ref = react.useRef(null);
  useAnimatedProductDialog(ref, open, onClose);
  return react.createElement('dialog', {
    ref, className: 'ia-product-modal', 'aria-label': label,
    onCancel: event => { event.preventDefault(); if (!busy) onClose(); },
    onClick: event => { if (event.target === ref.current && !busy) onClose(); }
  }, react.createElement('div', { className: 'ia-product-modal-content' }, children));
}

function useNavigationIndicator(ref, page, locale) {
  react.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const place = () => {
      const active = element.querySelector('[data-active=true]'), indicator = element.querySelector('.ia-nav-indicator');
      if (!active || !indicator) return;
      indicator.style.transform = `translateY(${active.offsetTop}px)`;
      indicator.style.height = `${active.offsetHeight}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  }, [page, locale]);
}

function useRightbarTransition(ref, fullscreen, open, visibilityKey) {
  const previous = react.useRef(null), controller = react.useRef(null), motion = useProductMotion();
  if (!controller.current) controller.current = createMotionController();
  react.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.inert = !open;
    const rect = element.getBoundingClientRect(), old = previous.current;
    if (open && old?.open && old.fullscreen !== fullscreen && rect.width && rect.height && old.rect.width && old.rect.height) {
      controller.current.play(element, [
        { transformOrigin:'top left', transform:`translate(${old.rect.left-rect.left}px,${old.rect.top-rect.top}px) scale(${old.rect.width/rect.width},${old.rect.height/rect.height})` },
        { transformOrigin:'top left', transform:'none' }
      ], motion.reduced ? 0 : 240, () => window.dispatchEvent(new Event('resize')));
    }
    previous.current = { rect, fullscreen, open };
    return () => controller.current.cancel();
  }, [fullscreen, open, visibilityKey, motion.revision]);
}

function ContentTransition({ identity, children }) {
  const ref = react.useRef(null), motion = useProductMotion();
  react.useLayoutEffect(() => {
    if (motion.reduced || !ref.current?.animate) return;
    const animation = ref.current.animate([{opacity:.35,transform:'translateY(4px)'},{opacity:1,transform:'none'}], {duration:160,easing:'ease-out'});
    return () => animation.cancel();
  }, [identity, motion.revision]);
  return react.createElement('div', { ref, className:'ia-content-transition' }, children);
}
