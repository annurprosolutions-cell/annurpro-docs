(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});
  const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Ruang tandatangan (unit logik px, dipaparkan berskala). Sama untuk editor, pratonton dan PDF.
  AI.SIGN_BOX = { w: 260, h: 140 };
  AI.SIGN_DEFAULTS = { cop_x: 36, cop_y: 20, cop_saiz: 106, tt_x: 24, tt_y: 28, tt_lebar: 150 };
  AI.SIGN_LIMITS = { cop: { min: 40, max: 200 }, tt: { min: 60, max: 240 } };
  AI.SIGN_KEYS = { cop: ['cop_x', 'cop_y', 'cop_saiz'], tt: ['tt_x', 'tt_y', 'tt_lebar'] };

  // Daripada tab Syarikat (nilai teks) → { cop:{x,y,w}, tt:{x,y,w} } dalam had yang sah
  AI.signPos = (sk) => {
    sk = sk || {};
    const D = AI.SIGN_DEFAULTS, L = AI.SIGN_LIMITS;
    return {
      cop: { x: num(sk.cop_x, D.cop_x), y: num(sk.cop_y, D.cop_y), w: clamp(num(sk.cop_saiz, D.cop_saiz), L.cop.min, L.cop.max) },
      tt: { x: num(sk.tt_x, D.tt_x), y: num(sk.tt_y, D.tt_y), w: clamp(num(sk.tt_lebar, D.tt_lebar), L.tt.min, L.tt.max) }
    };
  };
  AI.signToSettings = (pos) => ({
    cop_x: String(Math.round(pos.cop.x)), cop_y: String(Math.round(pos.cop.y)), cop_saiz: String(Math.round(pos.cop.w)),
    tt_x: String(Math.round(pos.tt.x)), tt_y: String(Math.round(pos.tt.y)), tt_lebar: String(Math.round(pos.tt.w))
  });
  AI.signReset = () => AI.signPos({});

  // Tinggi item = lebar × aspek (tinggi/lebar imej). Tanpa imej, anggap 1.
  const heightOf = (it, aspect) => it.w * (aspect > 0 ? aspect : 1);

  // Kekalkan item dalam kotak. Jika lebih besar daripada kotak, rapatkan ke kiri/atas.
  AI.clampItem = (it, aspect, box) => {
    box = box || AI.SIGN_BOX;
    const h = heightOf(it, aspect);
    return { x: clamp(it.x, 0, Math.max(0, box.w - it.w)), y: clamp(it.y, 0, Math.max(0, box.h - h)), w: it.w };
  };
  AI.moveItem = (it, dx, dy, aspect, box) => AI.clampItem({ x: it.x + dx, y: it.y + dy, w: it.w }, aspect, box);
  // Ubah saiz dari tengah item supaya ia tidak "melompat"
  AI.resizeItem = (it, key, w, aspect, box) => {
    const L = AI.SIGN_LIMITS[key];
    const nw = clamp(Math.round(w), L.min, L.max);
    const oh = heightOf(it, aspect), nh = nw * (aspect > 0 ? aspect : 1);
    return AI.clampItem({ x: it.x + (it.w - nw) / 2, y: it.y + (oh - nh) / 2, w: nw }, aspect, box);
  };

  // Susunan lukisan: tandatangan sentiasa di atas cop dalam dokumen. Dalam editor, item dipilih di atas.
  AI.signOrder = (selected) => (selected === 'cop' ? ['tt', 'cop'] : ['cop', 'tt']);

  // HTML ruang tandatangan (editor interaktif atau pratonton statik). Peratusan supaya berskala.
  // items: { cop:{url, aspect}|null, tt:{url, aspect}|null }
  AI.signHtml = (pos, items, o) => {
    o = o || {}; const esc = AI.esc, B = AI.SIGN_BOX;
    const order = o.static ? ['cop', 'tt'] : AI.signOrder(o.selected);
    const parts = order.map((k) => {
      const im = items[k]; if (!im || !im.url) return '';
      const it = pos[k], h = heightOf(it, im.aspect);
      const st = `left:${(it.x / B.w * 100).toFixed(3)}%;top:${(it.y / B.h * 100).toFixed(3)}%;width:${(it.w / B.w * 100).toFixed(3)}%;aspect-ratio:${(1 / (im.aspect > 0 ? im.aspect : 1)).toFixed(4)}`;
      if (o.static) return `<img class="sitem static" src="${esc(im.url)}" alt="" style="${st}">`;
      return `<div class="sitem${o.selected === k ? ' sel' : ''}" data-sitem="${k}" tabindex="0" role="group" aria-label="${k === 'cop' ? 'Cop' : 'Tandatangan'}: seret untuk alih, anak panah untuk gerak halus" style="${st}"><img src="${esc(im.url)}" alt="" draggable="false"></div>`;
    }).join('');
    return `<div class="sbox${o.static ? ' static' : ''}"${o.static ? '' : ' data-sbox'}>${parts}</div>`;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
