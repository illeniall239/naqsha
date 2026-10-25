// naqsha demo helpers for a HyperFrames composition: turn the events.json that
// capture.mjs wrote into a camera that follows the action, a drawn cursor, click
// ripples, key chips and blurred masks, all on the composition's GSAP timeline.
// Deterministic: everything comes from the event log, nothing from the clock.
//
//   <script src="assets/naqsha-demo.js"></script>
//   naqshaDemo.direct(tl, EVENTS, {
//     layer: '#screen',          // the element holding the <video>, sized to the video's own pixels
//                                // (events.video: viewport x scale). Keep the <video>'s CSS size equal
//                                // to its natural size: HyperFrames draws frames at the wrong size otherwise.
//     at: 2.0,                   // where the recording starts on the composition timeline (s)
//     trim: 0.4,                 // seconds cut from the recording's start (data-media-start)
//     until: 6.0,                // optional: the recording's second this segment ends at; cut idle time
//                                // by placing the same recording twice, each segment with its own layer
//     maxZoom: 1.8, accent: '#1f5f4a', camera: true, cursor: true, ripples: true, keys: true, masks: true,
//   });
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function el(tag, css, parent) {
    const n = document.createElement(tag);
    n.style.cssText = css;
    parent.appendChild(n);
    return n;
  }

  function direct(tl, log, o) {
    const layer = typeof o.layer === 'string' ? document.querySelector(o.layer) : o.layer;
    // Events are in the window's CSS pixels; the layer is in the video's pixels.
    const k = log.scale || 1;
    const vw = log.viewport.width * k, vh = log.viewport.height * k;
    const P = v => v * k;
    const B = b => ({ x: b.x * k, y: b.y * k, width: b.width * k, height: b.height * k });
    const at = o.at || 0, trim = o.trim || 0, until = o.until ?? Infinity;
    const T = ms => at + ms / 1000 - trim;                 // event time -> composition time
    const inside = ms => ms / 1000 >= trim && ms / 1000 < until;
    const events = log.events.filter(e => inside(e.t));
    // A move that started before this segment still sets where the cursor is when it begins.
    const before = log.events.filter(e => e.type === 'move' && e.t / 1000 < trim).pop();
    layer.style.transformOrigin = '0 0';
    layer.style.position = layer.style.position || 'absolute';
    const overlay = el('div', `position:absolute;left:0;top:0;width:${vw}px;height:${vh}px;pointer-events:none;`, layer);
    overlay.setAttribute('data-layout-allow-overflow', ''); // zoomed with the screen, so it may paint past the canvas

    if (o.masks !== false) {
      // Each entry is where a selector's elements were from that moment until the next entry.
      const bySel = {};
      for (const m of log.masks || []) (bySel[m.selector] ||= []).push(m);
      for (const list of Object.values(bySel)) {
        list.forEach((m, i) => {
          const next = list[i + 1];
          for (const b0 of m.boxes) {
            const b = B(b0);
            const n = el('div', `position:absolute;left:${b.x - 6}px;top:${b.y - 4}px;width:${b.width + 12}px;height:${b.height + 8}px;` +
              'border-radius:8px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);background:rgba(127,127,127,.35);opacity:0;', overlay);
            tl.set(n, { opacity: 1 }, Math.max(at, T(m.t)));
            if (next) tl.set(n, { opacity: 0 }, Math.max(at, T(next.t)));
          }
        });
      }
    }

    if (o.cursor !== false) {
      const cs = Math.round(34 * k);
      const c = el('div', `position:absolute;left:0;top:0;width:${cs}px;height:${cs}px;z-index:5;will-change:transform;`, overlay);
      c.innerHTML = `<svg viewBox="0 0 24 24" width="${cs}" height="${cs}"><path d="M5 3l14 8-6.5 1.6L9.8 19 5 3z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
      const first = events.find(e => e.type === 'move');
      const start = before ? before.to : first ? first.from : { x: vw / 2 / k, y: vh / 2 / k };
      tl.set(c, { x: P(start.x) - 6 * k, y: P(start.y) - 4 * k }, at);
      for (const e of events.filter(x => x.type === 'move')) {
        tl.to(c, { x: P(e.to.x) - 6 * k, y: P(e.to.y) - 4 * k, duration: Math.max(0.12, e.ms / 1000), ease: 'power2.inOut' }, T(e.t));
      }
      if (o.ripples !== false) {
        for (const e of events.filter(x => x.type === 'click')) {
          const rs = 44 * k;
          const r = el('div', `position:absolute;left:${P(e.x) - rs / 2}px;top:${P(e.y) - rs / 2}px;width:${rs}px;height:${rs}px;border-radius:50%;` +
            `border:${3 * k}px solid ${o.accent || '#2f5bd3'};opacity:0;transform:scale(.3);z-index:4;`, overlay);
          // immediateRender: false, or the ring would sit on the button before the click.
          tl.fromTo(r, { opacity: 0.85, scale: 0.3 }, { opacity: 0, scale: 1.7, duration: 0.5, ease: 'power2.out', immediateRender: false }, T(e.t));
          tl.fromTo(c, { scale: 1 }, { scale: 0.86, duration: 0.08, yoyo: true, repeat: 1, ease: 'power1.inOut', immediateRender: false }, T(e.t));
        }
      }
    }

    if (o.keys !== false) {
      for (const e of events.filter(x => x.type === 'key')) {
        const chip = el('div', `position:absolute;left:50%;bottom:${Math.round(vh * 0.06)}px;transform:translateX(-50%);padding:${10 * k}px ${18 * k}px;` +
          `border-radius:${10 * k}px;background:rgba(17,17,17,.82);color:#fff;font:600 ${26 * k}px/1 system-ui,sans-serif;opacity:0;z-index:6;`, overlay);
        chip.textContent = { Enter: 'Enter ↵', Escape: 'Esc', Tab: 'Tab ⇥', ArrowDown: '↓', ArrowUp: '↑' }[e.key] || e.key;
        tl.fromTo(chip, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out', immediateRender: false }, T(e.t));
        tl.to(chip, { opacity: 0, duration: 0.25 }, T(e.t) + 1.1);
      }
    }

    // The camera: zoom toward what's being clicked or typed into, hold while the
    // action plays, and pull back when the next action is far away or a while off.
    if (o.camera !== false) {
      const maxZoom = o.maxZoom || 1.8;
      const focus = events.filter(e => (e.type === 'click' || e.type === 'type' || e.type === 'hover') && e.box).map(e => ({ ...e, box: B(e.box) }));
      const view = (z, cx, cy) => ({ scale: z, x: clamp(vw / 2 - cx * z, vw - vw * z, 0), y: clamp(vh / 2 - cy * z, vh - vh * z, 0) });
      tl.set(layer, { scale: 1, x: 0, y: 0 }, at);
      let zoomed = false;
      // A target that already fills most of the frame (a table row, a whole panel) needs no
      // zoom: forcing one would crop the very thing being shown.
      const worth = e => Math.min((vw * 0.55) / e.box.width, (vh * 0.42) / e.box.height) >= 1.15;
      focus.splice(0, focus.length, ...focus.filter(worth));
      focus.forEach((e, i) => {
        const b = e.box;
        const z = clamp(Math.min((vw * 0.55) / b.width, (vh * 0.42) / b.height), 1.25, maxZoom);
        const v = view(z, b.x + b.width / 2, b.y + b.height / 2);
        const t = T(e.t);
        tl.to(layer, { ...v, duration: zoomed ? 0.6 : 0.8, ease: 'power3.inOut' }, Math.max(at, t - (zoomed ? 0.5 : 0.75)));
        zoomed = true;
        const next = focus[i + 1];
        const far = next && Math.hypot((next.box.x - b.x) / vw, (next.box.y - b.y) / vh) > 0.45;
        const gap = next ? (next.t - e.t) / 1000 : Infinity;
        if (!next || far || gap > 2.8) {
          const hold = e.type === 'type' ? (e.ms || 0) / 1000 + 0.8 : 1.3;
          tl.to(layer, { scale: 1, x: 0, y: 0, duration: 0.8, ease: 'power3.inOut' }, t + hold);
          zoomed = false;
        }
      });
    }
  }

  window.naqshaDemo = { direct };
})();
