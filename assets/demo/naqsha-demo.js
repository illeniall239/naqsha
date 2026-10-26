// naqsha demo runtime for a HyperFrames composition. Two parts, both on the composition's
// one GSAP timeline and deterministic (everything from the timeline and the event log,
// nothing from the clock, no callbacks that a seek would skip):
//
// 1. direct(): turns the events.json that capture.mjs wrote into a camera that follows the
//    action, a big cursor whose click causes the change, key chips, blurred masks, and an
//    invisible hit box at every click that transitions can zoom through or grow from.
//
//      naqshaDemo.direct(tl, EVENTS, {
//        layer: el,              // holds the <video>, sized to the video's own pixels
//        at: 2.0,                // where the recording starts on the composition timeline (s)
//        trim: 0.4,              // seconds cut from the recording's start (data-media-start)
//        until: 6.0,             // the recording's second this segment ends at
//        scene: 'SC4',           // hit boxes are listed under naqshaDemo.hits[scene]
//        frame: el, window: { scale: 0.86, x: 134, y: 40 },   // optional: the window on its
//                                // ground, which the camera opens to full frame on a punch-in
//        enterCursor: true,      // the cursor comes in from off-screen
//        maxZoom: 2, accent, font, ink, ground, camera, cursor, keys, masks: true by default
//      });
//
// 2. The kit, for kit scenes and hand-made ones alike:
//      const k = naqshaDemo.kit(tl);
//      k.enter(el, at, 'blur')   entrances: mask, blur, ink, line, letters, snap, cut
//      k.leave(el, at, 'blur')   exits, shorter than entrances: blur, mask, cut
//      k.type(el, at, seconds)   types the element's text in, a character at a time
//      k.odometer(el, at, s)     rolls a number in, digit columns landing left to right
//      k.cursor(parent, opts)    a drawn cursor: .to(x, y, at, s), .click(at), .enter(at, x, y)
//      k.frameOn(el, box, at, s) moves a stage so the box fills the frame (a punch-in)
//      naqshaDemo.spring(0.8)    a closed-form spring ease: 1 never bounces, 0.7-0.85 premium
// A word marked <em data-roll="Plans|Designs">Demos</em> rolls through its options, slot
// machine style, as its line enters.
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const W = 1920, H = 1080;

  function el(tag, css, parent) {
    const n = document.createElement(tag);
    n.style.cssText = css;
    parent.appendChild(n);
    return n;
  }

  // A damped spring as a function of t in 0..1, settled by t = 1. As a closed form, any
  // frame renders on its own. Position and size may bounce; opacity and color never should.
  function spring(damping) {
    const z = damping == null ? 0.8 : damping;
    const w = Math.max(10, 7 / Math.max(z, 0.05));
    if (z >= 1) return t => (t >= 1 ? 1 : 1 - Math.exp(-w * t) * (1 + w * t));
    const wd = w * Math.sqrt(1 - z * z);
    return t => (t >= 1 ? 1 : 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t)));
  }

  // ---- the kit -----------------------------------------------------------------

  // Words and letters as their own boxes, split once at build time. <em> keeps its words;
  // a [data-roll] word stays whole.
  function split(node, unit) {
    const key = unit === 'letters' ? '__letters' : '__words';
    if (node[key]) return node[key];
    const out = [];
    const walk = n => {
      for (const c of [...n.childNodes]) {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const part of c.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
            const pieces = unit === 'letters' ? [...part] : [part];
            const word = unit === 'letters' ? el('span', 'display:inline-block;white-space:nowrap', frag) : frag;
            for (const p of pieces) {
              const s = el('span', 'display:inline-block', word);
              s.textContent = p;
              out.push(s);
            }
          }
          n.replaceChild(frag, c);
        } else if (c.nodeType === 1 && c.hasAttribute('data-roll')) out.push(c);
        else if (c.nodeType === 1) walk(c);
      }
    };
    walk(node);
    node[key] = out;
    return out;
  }

  // A slot-machine word: a column of its options and itself, stepped through as it lands.
  function roll(tl, word, at) {
    if (word.__roll) return;
    const opts = word.getAttribute('data-roll').split('|').filter(Boolean);
    const final = word.textContent;
    const lh = word.getBoundingClientRect().height || 1;
    const w = word.getBoundingClientRect().width;
    word.textContent = '';
    Object.assign(word.style, { display: 'inline-block', overflow: 'hidden', height: lh + 'px', verticalAlign: 'bottom', width: w + 'px', textAlign: 'left' });
    const col = el('span', 'display:block;white-space:nowrap', word);
    for (const o of [...opts, final]) el('span', `display:block;height:${lh}px`, col).textContent = o;
    word.__roll = col;
    tl.set(col, { y: 0 }, 0);
    opts.forEach((_, i) => tl.to(col, { y: -(i + 1) * lh, duration: i === opts.length - 1 ? 0.28 : 0.09, ease: i === opts.length - 1 ? 'back.out(1.6)' : 'power1.in' }, at + 0.15 + i * 0.1));
  }

  function kit(tl) {
    // Hidden from frame 0 until the entrance, so nothing shows before its moment. An
    // entrance at 0 s is no entrance: that element is the thumbnail and stays put.
    const hide = (target, state) => tl.set(target, state, 0);
    const ENTRANCES = {
      // Revealed from behind its own lower edge; the element needs an inner .in line.
      mask(node, at) {
        const inner = node.querySelector(':scope > .in') || node;
        node.style.overflow = 'hidden';
        hide(inner, { yPercent: 110 });
        tl.fromTo(inner, { yPercent: 110 }, { yPercent: 0, duration: 0.62, ease: 'expo.out', immediateRender: false }, at);
        return 0.62;
      },
      // Word by word out of a blur, no movement.
      blur(node, at) {
        const ws = split(node);
        ws.forEach((w, i) => {
          hide(w, { opacity: 0, filter: 'blur(6px)' });
          tl.fromTo(w, { opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.14, ease: 'power2.out', immediateRender: false }, at + i * 0.067);
        });
        return 0.14 + ws.length * 0.067;
      },
      // The line appears in the dim color; each word turns to ink (or the accent) in turn.
      ink(node, at) {
        const ws = split(node);
        const dim = getComputedStyle(node).getPropertyValue('--dim').trim() || '#888';
        hide(node, { opacity: 0 });
        tl.set(node, { opacity: 1 }, at);
        ws.forEach((w, i) => {
          const to = getComputedStyle(w).color;
          hide(w, { color: dim });
          tl.fromTo(w, { color: dim }, { color: to, duration: 0.1, ease: 'none', immediateRender: false }, at + 0.12 + i * 0.085);
        });
        return 0.22 + ws.length * 0.085;
      },
      // The whole line out of a blur.
      line(node, at) {
        hide(node, { opacity: 0, filter: 'blur(8px)' });
        tl.fromTo(node, { opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.18, ease: 'power2.out', immediateRender: false }, at);
        return 0.18;
      },
      // Letter by letter, for a name.
      letters(node, at) {
        const ls = split(node, 'letters');
        const step = Math.min(0.1, 0.9 / Math.max(1, ls.length));
        hide(node, { opacity: 0 });
        tl.set(node, { opacity: 1 }, at);
        ls.forEach((l, i) => {
          hide(l, { opacity: 0.3, filter: 'blur(3px)' });
          tl.fromTo(l, { opacity: 0.3, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.25, ease: 'power2.out', immediateRender: false }, at + i * step);
        });
        return 0.25 + ls.length * step;
      },
      // Lands at full strength, a touch large, and settles.
      snap(node, at) {
        hide(node, { opacity: 0 });
        tl.set(node, { opacity: 1 }, at);
        tl.fromTo(node, { scale: 1.08 }, { scale: 1, duration: 0.2, ease: 'power4.out', immediateRender: false }, at);
        return 0.2;
      },
      cut(node, at) {
        hide(node, { opacity: 0 });
        tl.set(node, { opacity: 1 }, at);
        return 0;
      },
    };
    const api = {
      enter(node, at, style) {
        if (typeof node === 'string') node = document.querySelector(node);
        if (!node || at <= 0.001) return 0;
        const fn = ENTRANCES[style] || ENTRANCES.blur;
        const took = fn(node, at);
        node.querySelectorAll('[data-roll]').forEach(w => roll(tl, w, at));
        return took;
      },
      // Exits are about half as long as entrances and in one motion.
      leave(node, at, style) {
        if (typeof node === 'string') node = document.querySelector(node);
        if (!node) return;
        if (style === 'mask') {
          const inner = node.querySelector(':scope > .in') || node;
          tl.to(inner, { yPercent: -110, duration: 0.3, ease: 'power3.in' }, at);
        } else if (style === 'cut') tl.set(node, { opacity: 0 }, at);
        else tl.to(node, { opacity: 0, filter: 'blur(8px)', duration: 0.18, ease: 'power2.in' }, at);
      },
      // The text is typed in a character at a time: a clip opens over it in steps, so its
      // box keeps its real width and nothing is measured.
      type(node, at, seconds) {
        if (typeof node === 'string') node = document.querySelector(node);
        const n = node.textContent.length;
        Object.assign(node.style, { display: 'inline-block', whiteSpace: 'nowrap' });
        hide(node, { clipPath: 'inset(0% 100% 0% 0%)' });
        tl.fromTo(node, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: seconds, ease: `steps(${Math.max(1, n)})`, immediateRender: false }, at);
      },
      // A number rolled in as digit columns, the leftmost landing first. Commas, points and
      // units stay still. Transforms only, so every frame seeks right.
      odometer(node, at, seconds) {
        if (typeof node === 'string') node = document.querySelector(node);
        const text = node.textContent;
        const lh = node.getBoundingClientRect().height || 1;
        node.textContent = '';
        const digits = [...text].filter(c => /\d/.test(c)).length;
        let d = 0;
        for (const c of text) {
          if (!/\d/.test(c)) { el('span', 'display:inline-block', node).textContent = c; continue; }
          const box = el('span', `display:inline-block;overflow:hidden;height:${lh}px;vertical-align:bottom`, node);
          const col = el('span', 'display:block', box);
          const row = Number(c) + (d === digits - 1 ? 10 : d === digits - 2 ? 10 : 0);
          // The digits rolling past are faint, so only the one that lands reads as text.
          for (let r = 0; r < 20; r++) el('span', `display:block;height:${lh}px;text-align:center${r === row ? '' : ';opacity:.3'}`, col).textContent = String(r % 10);
          hide(col, { y: 0 });
          tl.fromTo(col, { y: 0 }, { y: -row * lh, duration: Math.max(0.6, seconds - (digits - 1 - d) * 0.08), ease: 'power3.out', immediateRender: false }, at + d * 0.03);
          d++;
        }
      },
      // A drawn cursor for a rebuilt screen: big (4 to 7% of the frame) and it causes what
      // changes. Positions are in the parent's pixels, at the cursor's tip.
      cursor(parent, opts) {
        const o = opts || {};
        const size = o.size || 64;
        const c = el('div', `position:absolute;left:0;top:0;width:${size}px;height:${size}px;z-index:20;transform-origin:21% 12%;will-change:transform`, parent);
        c.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="M5 3l14 8-6.5 1.6L9.8 19 5 3z" fill="${o.fill || '#111'}" stroke="${o.stroke || '#fff'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
        const tip = (x, y) => ({ x: x - size * 0.21, y: y - size * 0.12 });
        hide(c, { opacity: 0 });
        return {
          el: c,
          // From off-screen (or a given point) to the first position.
          enter(at, x, y, from) {
            const f = from || [W + 40, H * 0.8];
            tl.set(c, { opacity: 1, ...tip(f[0], f[1]) }, at);
            tl.to(c, { ...tip(x, y), duration: 0.6, ease: 'power3.out' }, at);
          },
          to(x, y, at, seconds) { tl.to(c, { ...tip(x, y), duration: seconds || 0.5, ease: 'power2.inOut' }, at); },
          click(at) { tl.fromTo(c, { scale: 1 }, { scale: 0.84, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.inOut', immediateRender: false }, at); },
          leave(at) { tl.to(c, { opacity: 0, duration: 0.15 }, at); },
        };
      },
      // Moves and scales a full-frame element (a scene's stage, or a wrapper inside it the
      // size of the frame, scaling about its center) so a box in its pixels fills the frame.
      // frameOn(el, null, at) goes back to the whole frame.
      frameOn(stage, box, at, seconds, fill) {
        const v = box ? (() => { const z = Math.min((W * (fill || 0.8)) / box.width, (H * (fill || 0.8)) / box.height);
          return { scale: z, x: -z * (box.x + box.width / 2 - W / 2), y: -z * (box.y + box.height / 2 - H / 2) }; })() : { scale: 1, x: 0, y: 0 };
        tl.to(stage, { ...v, duration: seconds || 0.6, ease: 'power2.inOut' }, at);
      },
    };
    return api;
  }

  // ---- recordings ----------------------------------------------------------------

  const hits = {};

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

    // A hit box at every click, moving with the camera, so a transition can zoom through
    // or grow from the very thing that was clicked.
    const list = (hits[o.scene || 'main'] ||= []);
    events.filter(e => e.type === 'click' && e.box).forEach(e => {
      const b = B(e.box);
      const n = el('div', `position:absolute;left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px;pointer-events:none;`, overlay);
      n.setAttribute('data-hit', '');
      list.push({ t: T(e.t), el: n });
    });

    if (o.masks !== false) {
      // Each entry is where a selector's elements were from that moment until the next entry.
      const bySel = {};
      for (const m of log.masks || []) (bySel[m.selector] ||= []).push(m);
      for (const ms of Object.values(bySel)) {
        ms.forEach((m, i) => {
          const next = ms[i + 1];
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

    // The cursor: about 5% of the frame at rest. It sits in the zoomed layer so it stays on
    // its target, and shrinks against the zoom so a punch-in doesn't make it huge.
    let c = null;
    if (o.cursor !== false) {
      const cs = Math.round(40 * k);
      c = el('div', `position:absolute;left:0;top:0;width:${cs}px;height:${cs}px;z-index:5;will-change:transform;transform-origin:21% 12%;`, overlay);
      c.innerHTML = `<svg viewBox="0 0 24 24" width="${cs}" height="${cs}"><path d="M5 3l14 8-6.5 1.6L9.8 19 5 3z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
      const first = events.find(e => e.type === 'move');
      const start = before ? before.to : first ? first.from : { x: vw / 2 / k, y: vh / 2 / k };
      const pos = p => ({ x: P(p.x) - cs * 0.21, y: P(p.y) - cs * 0.12 });
      // It comes in from off-screen when there's time before its first move.
      if (o.enterCursor && first && T(first.t) - at >= 0.7) {
        tl.set(c, { x: vw + 40 * k, y: vh * 0.82 }, at);
        tl.to(c, { ...pos(start), duration: 0.55, ease: 'power3.out' }, at);
      } else tl.set(c, pos(start), at);
      for (const e of events.filter(x => x.type === 'move')) {
        tl.to(c, { ...pos(e.to), duration: Math.max(0.12, e.ms / 1000), ease: 'power2.inOut' }, T(e.t));
      }
      // The click is a press, and what it causes is the next thing on screen: no rings.
      for (const e of events.filter(x => x.type === 'click')) {
        tl.fromTo(c.firstChild, { scale: 1 }, { scale: 0.84, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.inOut', immediateRender: false, transformOrigin: '21% 12%' }, T(e.t));
      }
      if (o.ripples) {
        for (const e of events.filter(x => x.type === 'click')) {
          const rs = 44 * k;
          const r = el('div', `position:absolute;left:${P(e.x) - rs / 2}px;top:${P(e.y) - rs / 2}px;width:${rs}px;height:${rs}px;border-radius:50%;` +
            `border:${3 * k}px solid ${o.accent || '#2f5bd3'};opacity:0;transform:scale(.3);z-index:4;`, overlay);
          tl.fromTo(r, { opacity: 0.85, scale: 0.3 }, { opacity: 0, scale: 1.7, duration: 0.5, ease: 'power2.out', immediateRender: false }, T(e.t));
        }
      }
    }

    if (o.keys !== false) {
      for (const e of events.filter(x => x.type === 'key')) {
        const chip = el('div', `position:absolute;left:50%;bottom:${Math.round(vh * 0.08)}px;transform:translateX(-50%);padding:${12 * k}px ${22 * k}px;` +
          `border-radius:${12 * k}px;background:${o.ink || '#111'};color:${o.ground || '#fff'};font:600 ${28 * k}px/1 ${o.font || 'system-ui, sans-serif'};opacity:0;z-index:6;`, overlay);
        chip.textContent = { Enter: 'Enter ↵', Escape: 'Esc', Tab: 'Tab ⇥', ArrowDown: '↓', ArrowUp: '↑' }[e.key] || e.key;
        tl.fromTo(chip, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out', immediateRender: false }, T(e.t));
        tl.to(chip, { opacity: 0, duration: 0.15 }, T(e.t) + 1.1);
      }
    }

    // The camera cycles between the window on its ground, the full screen and a punch-in on
    // the control being used: it moves toward what's clicked or typed into, holds while the
    // UI acts, and pulls back when the next action is far away or a while off.
    if (o.camera !== false) {
      const maxZoom = o.maxZoom || 2;
      const frame = o.frame, win = o.window;
      const focus = events.filter(e => (e.type === 'click' || e.type === 'type' || e.type === 'hover') && e.box).map(e => ({ ...e, box: B(e.box) }));
      const view = (z, cx, cy) => ({ scale: z, x: clamp(vw / 2 - cx * z, vw - vw * z, 0), y: clamp(vh / 2 - cy * z, vh - vh * z, 0) });
      const open = { scale: 1, x: 0, y: 0, borderRadius: 0 };
      const rest = win ? { scale: win.scale, x: win.x, y: win.y, borderRadius: win.radius ?? 18 } : null;
      tl.set(layer, { scale: 1, x: 0, y: 0 }, at);
      let zoomed = false;
      const counter = (z, t, d) => c && tl.to(c, { scale: Math.pow(z, -0.6), duration: d, ease: 'power3.inOut' }, t);
      // A target that already fills most of the frame (a table row, a whole panel) needs no
      // zoom: forcing one would crop the very thing being shown.
      const worth = e => Math.min((vw * 0.55) / e.box.width, (vh * 0.42) / e.box.height) >= 1.15;
      const shots = focus.filter(worth);
      shots.forEach((e, i) => {
        const b = e.box;
        const z = clamp(Math.min((vw * 0.55) / b.width, (vh * 0.42) / b.height), 1.25, maxZoom);
        const v = view(z, b.x + b.width / 2, b.y + b.height / 2);
        const t = T(e.t);
        const d = zoomed ? 0.55 : 0.7;
        const from = Math.max(at, t - (zoomed ? 0.45 : 0.65));
        tl.to(layer, { ...v, duration: d, ease: 'power3.inOut' }, from);
        if (rest && !zoomed) tl.to(frame, { ...open, duration: d, ease: 'power3.inOut' }, from);
        counter(z, from, d);
        zoomed = true;
        const next = shots[i + 1];
        const far = next && Math.hypot((next.box.x - b.x) / vw, (next.box.y - b.y) / vh) > 0.45;
        const gap = next ? (next.t - e.t) / 1000 : Infinity;
        if (!next || far || gap > 2.8) {
          const hold = e.type === 'type' ? (e.ms || 0) / 1000 + 0.8 : 1.3;
          tl.to(layer, { scale: 1, x: 0, y: 0, duration: 0.7, ease: 'power3.inOut' }, t + hold);
          if (rest) tl.to(frame, { ...rest, duration: 0.7, ease: 'power3.inOut' }, t + hold);
          counter(1, t + hold, 0.7);
          zoomed = false;
        }
      });
    }
  }

  window.naqshaDemo = { direct, kit, spring, hits };
})();
