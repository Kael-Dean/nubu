// Nubu placement track — shared by Node (ffmpeg expressions) and the scene pages (floor shadow).
// Loaded in the browser via <script> (window.NubuTrack) and in Node via require().
//
// Moves are eased in-out (sine). Horizontal and vertical motion are slightly staggered (an arc):
// when Nubu rises/grows (corner → centre) the vertical/scale part leads and the sideways part trails,
// when it sinks/shrinks (centre → corner) the sideways part leads. This keeps Nubu's feet clear of
// the subtitle band during moves. Each axis still starts and stops at zero velocity.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NubuTrack = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SRC_W = 690, SRC_H = 695;
  const LEAD = [0, 0.7], TRAIL = [0.3, 1];

  // mode → {x, y, s}: top-left of the scaled Nubu frame + scale factor
  function modeRect(m) {
    const s = m.h / SRC_H;
    const w = SRC_W * s;
    let x;
    if (m.cx != null) x = m.cx - w / 2;
    else if (m.right != null) x = m.right - w;
    else x = m.x || 0;
    const y = m.bottom - m.h;
    return { x, y, s, w, h: m.h, cx: x + w / 2, bottom: m.bottom, sub: m.subCx, suby: m.subBottom };
  }
  const win = (prop, rising) => {
    if (prop === 'x' || prop === 'sub') return rising ? TRAIL : LEAD;
    if (prop === 'suby') return rising ? [0, 0.6] : [0.4, 1]; // subtitles clear the way before Nubu grows, follow after it shrinks
    return rising ? LEAD : TRAIL; // y, s
  };
  const ease = (p, [a, b]) => { const q = Math.min(1, Math.max(0, (p - a) / (b - a))); return (1 - Math.cos(Math.PI * q)) / 2; };

  // keys: [{t, mode, dur}] — the first key has no transition. Transition starts at t, lasts dur.
  function rectAt(t, keys, modes) {
    let cur = modeRect(modes[keys[0].mode]);
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i];
      if (k.t > t) break;
      const prev = cur, target = modeRect(modes[k.mode]);
      const d = k.dur || 0;
      if (d <= 0 || t >= k.t + d) { cur = target; continue; }
      const p = (t - k.t) / d, rising = target.bottom - target.h < prev.bottom - prev.h || target.s > prev.s;
      // interpolate centre-x and bottom so the arc is about the feet
      const ex = ease(p, win('x', rising)), ey = ease(p, win('y', rising));
      const s = prev.s + (target.s - prev.s) * ey;
      const w = SRC_W * s, h = SRC_H * s;
      const cx = prev.cx + (target.cx - prev.cx) * ex;
      const bottom = prev.bottom + (target.bottom - prev.bottom) * ey;
      const sub = prev.sub + (target.sub - prev.sub) * ease(p, win('sub', rising));
      const suby = prev.suby + (target.suby - prev.suby) * ease(p, win('suby', rising));
      cur = { x: cx - w / 2, y: bottom - h, s, w, h, cx, bottom, sub, suby };
      break;
    }
    return cur;
  }

  // Which mode is Nubu settled in over the whole of [a,b]? null = moving / mixed
  function modeOver(a, b, keys) {
    for (let i = 0; i < keys.length; i++) {
      const settled = i === 0 ? -1e9 : keys[i].t + (keys[i].dur || 0);
      const to = i + 1 < keys.length ? keys[i + 1].t : 1e9;
      if (a >= settled && b <= to) return keys[i].mode;
    }
    return null;
  }

  // ffmpeg expression (in t) for 'x' | 'y' | 's' | 'w' | 'h' | 'sub' (subtitle centre x)
  function ffExpr(keys, modes, prop) {
    const R = keys.map((k) => modeRect(modes[k.mode]));
    const f = (v) => (Math.round(v * 10000) / 10000).toString();
    const val = (r) => ({ x: r.x, y: r.y, s: r.s, w: r.w, h: r.h, sub: r.sub, suby: r.suby }[prop]);
    const E = (p, w) => `(1-cos(PI*clip((${p}-${w[0]})/${f(w[1] - w[0])},0,1)))/2`;
    let expr = f(val(R[R.length - 1]));
    for (let i = keys.length - 1; i >= 1; i--) {
      const k = keys[i], A = R[i - 1], B = R[i], d = k.dur || 0;
      let trans = expr;
      if (d > 0) {
        const rising = B.bottom - B.h < A.bottom - A.h || B.s > A.s;
        const p = `((t-${f(k.t)})/${f(d)})`;
        const ex = E(p, win('x', rising)), ey = E(p, win('y', rising));
        const S = `(${f(A.s)}+(${f(B.s - A.s)})*${ey})`;
        let v;
        if (prop === 's') v = S;
        else if (prop === 'w') v = `(${SRC_W}*${S})`;
        else if (prop === 'h') v = `(${SRC_H}*${S})`;
        else if (prop === 'x') v = `(${f(A.cx)}+(${f(B.cx - A.cx)})*${ex}-${SRC_W}*${S}/2)`;
        else if (prop === 'y') v = `(${f(A.bottom)}+(${f(B.bottom - A.bottom)})*${ey}-${SRC_H}*${S})`;
        else if (prop === 'suby') v = `(${f(A.suby)}+(${f(B.suby - A.suby)})*${E(p, win('suby', rising))})`;
        else if (prop === 'sub') v = `(${f(A.sub)}+(${f(B.sub - A.sub)})*${E(p, win('sub', rising))})`;
        trans = `if(lt(t,${f(k.t + d)}),${v},${expr})`;
      }
      expr = `if(lt(t,${f(k.t)}),${f(val(A))},${trans})`;
    }
    return expr;
  }

  return { SRC_W, SRC_H, modeRect, rectAt, modeOver, ffExpr };
});
