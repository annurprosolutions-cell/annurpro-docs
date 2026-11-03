(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});

  AI.IMG_MAX_SIDE = 800;
  AI.IMG_MAX_BYTES = 5 * 1024 * 1024;
  AI.IMG_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  // jenis gambar → kunci tab Syarikat
  AI.IMG_KEYS = { logo: 'logo_id', cop: 'cop_id', tt: 'tt_gambar_id', dott: 'do_tt_gambar_id' };
  AI.IMG_LABEL = { logo: 'Logo', cop: 'Cop', tt: 'Tandatangan', dott: 'Tandatangan DO' };

  // ---------- logik tulen ----------
  // Semak fail sebelum diproses. Pulang mesej ralat atau ''.
  AI.checkImageFile = (f) => {
    if (!f) return 'Tiada fail dipilih.';
    if (!AI.IMG_TYPES.includes(f.type)) return 'Hanya gambar PNG, JPG atau WebP dibenarkan.';
    if (f.size > AI.IMG_MAX_BYTES) return 'Gambar terlalu besar (maksimum 5 MB).';
    if (f.size === 0) return 'Fail kosong.';
    return '';
  };

  // Muat dalam kotak max×max tanpa membesarkan gambar kecil
  AI.fitSize = (w, h, max) => {
    max = max || AI.IMG_MAX_SIDE;
    const k = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  };

  // Buang latar putih secara lembut (RGBA, diubah di tempat). tol 5–80: lebih tinggi = lebih banyak dibuang.
  // Piksel hampir putih jadi lutsinar penuh; di antara, lutsinar separa dan warna dinyahcampur daripada putih
  // supaya tiada pinggir putih pada tinta atau cop.
  AI.removeWhite = (data, tol) => {
    const t = Math.min(80, Math.max(5, Number(tol) || 30));
    const hi = 255 - t, lo = hi - 40;
    let cleared = 0;
    for (let i = 0; i < data.length; i += 4) {
      const m = Math.min(data[i], data[i + 1], data[i + 2]);
      if (m >= hi) { data[i + 3] = 0; cleared++; continue; }
      if (m <= lo) continue;
      const a = (hi - m) / (hi - lo);                        // 0..1, 1 = pekat
      const alpha = Math.round(a * data[i + 3]);
      for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.max(0, Math.round((data[i + c] - 255 * (1 - a)) / a)));
      data[i + 3] = alpha;
    }
    return cleared;
  };

  // Kotak sempadan kandungan tidak lutsinar (+ padding). null jika semuanya lutsinar.
  AI.trimBounds = (data, w, h, pad) => {
    pad = pad || 0;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };

  AI.bytesToDataUrl = (bytes, mime) => {
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return 'data:' + (mime || 'image/png') + ';base64,' + btoa(s);
  };

  // ---------- pelayar (DOM) ----------
  AI.loadImageFile = async (file) => {
    const bad = AI.checkImageFile(file); if (bad) throw new Error(bad);
    let img;
    try {
      img = root.createImageBitmap ? await root.createImageBitmap(file, { imageOrientation: 'from-image' }) : await new Promise((res, rej) => {
        const u = URL.createObjectURL(file), im = new Image();
        im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('x')); }; im.src = u;
      });
    } catch (e) { throw new Error('Gambar tidak dapat dibuka. Cuba fail lain.'); }
    return { img, w: img.width, h: img.height, name: file.name };
  };

  // src: hasil loadImageFile. o: { removeWhite, tol, max }. Pulang { bytes, url, w, h, aspect }
  AI.processImage = async (src, o) => {
    o = o || {};
    const { w, h } = AI.fitSize(src.w, src.h, o.max || AI.IMG_MAX_SIDE);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src.img, 0, 0, w, h);
    let out = c;
    if (o.removeWhite) {
      const id = ctx.getImageData(0, 0, w, h);
      AI.removeWhite(id.data, o.tol);
      const b = AI.trimBounds(id.data, w, h, 2);
      if (!b) throw new Error('Gambar jadi kosong selepas buang latar putih. Kurangkan toleransi atau matikan pilihan itu.');
      ctx.putImageData(id, 0, 0);
      out = document.createElement('canvas'); out.width = b.w; out.height = b.h;
      out.getContext('2d').drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    }
    const blob = await new Promise((res, rej) => out.toBlob((x) => (x ? res(x) : rej(new Error('Gagal menghasilkan PNG'))), 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, url: AI.bytesToDataUrl(bytes, 'image/png'), w: out.width, h: out.height, aspect: out.height / out.width };
  };

  /**
   * Simpanan gambar tetapan dalam folder _Tetapan pengguna (Drive) dengan cache di peranti (IndexedDB).
   * opts: { api, idb, folderId }
   */
  AI.ImageStore = function (opts) {
    const { api, idb } = opts;
    const key = (id) => 'img:' + id;
    this.cached = async (id) => (idb ? idb.get('kv', key(id)) : undefined);
    // → dataURL atau null jika fail tiada
    this.get = async (id) => {
      if (!id) return null;
      const hit = await this.cached(id);
      if (hit) return hit;
      try {
        const r = await api.downloadBytes(id);
        const url = AI.bytesToDataUrl(r.bytes, r.type || 'image/png');
        if (idb) await idb.set('kv', key(id), url);
        return url;
      } catch (e) { if (e.status === 404 || e.status === 403) return null; throw e; }
    };
    // cipta fail baharu dalam folder, muat naik kandungan; pulang { id, url }
    this.put = async (kind, bytes, folderId) => {
      const f = await api.createFile({ name: `${kind}_${Date.now()}.png`, mimeType: 'image/png', parents: [folderId || opts.folderId],
        appProperties: { [AI.APP_MARK]: 'image', kind } });
      try { await api.uploadBytes(f.id, bytes, 'image/png'); }
      catch (e) { try { await api.trash(f.id); } catch (e2) { /* abaikan */ } throw e; }
      const url = AI.bytesToDataUrl(bytes, 'image/png');
      if (idb) await idb.set('kv', key(f.id), url);
      return { id: f.id, url };
    };
    // buang fail lama (ke tong sampah Drive) dan cache; ralat diabaikan kerana fail baharu sudah selamat
    this.drop = async (id) => {
      if (!id) return;
      try { await api.trash(id); } catch (e) { /* mungkin sudah dipadam */ }
      if (idb) await idb.del('kv', key(id));
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
