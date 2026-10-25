import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Animate the layout change with transforms; do not reflow chat text on every animation frame. */
export function useGraphDisclosure(visible: boolean, reduced: boolean) {
  const [present, setPresent] = useState(visible);
  const workspace = useRef<HTMLDivElement>(null);
  const chat = useRef<HTMLElement>(null);
  const first = useRef<DOMRect | null>(null);
  const chatAnimation = useRef<Animation | null>(null);
  const graphAnimation = useRef<Animation | null>(null);
  const generation = useRef(0);
  const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';

  const captureChat = () => {
    first.current = chat.current?.getBoundingClientRect() ?? null;
    chatAnimation.current?.cancel();
  };
  // A new request can interrupt an entrance, exit or the chat's movement.
  useLayoutEffect(() => {
    const request = ++generation.current;
    const graph = workspace.current?.querySelector<HTMLElement>('.network-card');
    if (visible) {
      if (!present) { captureChat(); setPresent(true); }
      else if (graphAnimation.current && graph) {
        const style = getComputedStyle(graph);
        const from = { opacity: style.opacity, transform: style.transform };
        graphAnimation.current.cancel();
        if (!reduced) graphAnimation.current = graph.animate([from, { opacity: 1, transform: 'none' }], { duration: 220, easing: ease });
      }
      return;
    }
    if (!present) return;
    if (reduced || !graph) { captureChat(); setPresent(false); return; }
    const from = { opacity: getComputedStyle(graph).opacity, transform: getComputedStyle(graph).transform };
    graphAnimation.current?.cancel();
    const exit = graph.animate([from, { opacity: 0, transform: 'translateX(-8px) scale(0.985)' }], { duration: 160, easing: ease, fill: 'forwards' });
    graphAnimation.current = exit;
    void exit.finished.then(() => {
      if (request !== generation.current) return;
      captureChat(); setPresent(false);
    }).catch(() => {}); // Cancellation is expected when the user changes direction.
  }, [visible, reduced]);

  useLayoutEffect(() => {
    if (!present) { graphAnimation.current?.cancel(); graphAnimation.current = null; }
    const start = first.current, panel = chat.current;
    first.current = null;
    if (!start || !panel || reduced) return;
    const end = panel.getBoundingClientRect();
    chatAnimation.current = panel.animate([
      { transformOrigin: 'top left', transform: `translate(${start.left - end.left}px, ${start.top - end.top}px) scale(${start.width / end.width}, ${start.height / end.height})` },
      { transformOrigin: 'top left', transform: 'none' },
    ], { duration: 320, easing: ease });
    if (present) {
      const graph = workspace.current?.querySelector<HTMLElement>('.network-card');
      if (graph) graphAnimation.current = graph.animate([
        { opacity: 0, transform: 'translateX(-12px) scale(0.985)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 280, delay: 50, easing: ease, fill: 'backwards' });
    }
  }, [present, reduced]);

  useEffect(() => () => {
    generation.current++;
    chatAnimation.current?.cancel();
    graphAnimation.current?.cancel();
  }, []);
  return { present, workspace, chat };
}
