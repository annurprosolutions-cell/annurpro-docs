(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});

  // Pustaka disimpan dalam repo (vendor/), dimuat hanya bila PDF pertama dijana. Tiada CDN.
  AI.PDF_LIBS = ['vendor/html2canvas-1.4.1.min.js', 'vendor/jspdf-2.5.1.umd.min.js'];
  const loaded = {};
  AI.loadScript = (src) => loaded[src] || (loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => { delete loaded[src]; rej(new Error('Gagal memuat ' + src + '. Semak sambungan internet.')); };
    document.head.appendChild(s);
  }));

  /**
   * Halaman HTML A4 (AI.renderDocPages) → PDF A4 (Uint8Array). Setiap halaman dirasterkan pada skala 2 (≈192 dpi).
   * Teks dalam PDF ialah imej (had diketahui, docs/02-TRD.md §3); naik taraf ke PDF vektor kemudian.
   */
  AI.makePdf = async (pages, meta) => {
    await Promise.all(AI.PDF_LIBS.map(AI.loadScript));
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;pointer-events:none;';
    host.innerHTML = pages.join('');
    document.body.appendChild(host);
    try {
      if (document.fonts && document.fonts.ready) { try { await document.fonts.load('400 12px Carlito'); await document.fonts.load('700 12px Carlito'); } catch (e) { /* fallback font */ } await document.fonts.ready; }
      await Promise.all(Array.from(host.querySelectorAll('img')).map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
      const { jsPDF } = root.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      const els = host.querySelectorAll('.a4');
      for (let i = 0; i < els.length; i++) {
        const canvas = await root.html2canvas(els[i], { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, width: 794, height: 1123, windowWidth: 794 });
        if (i) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      pdf.setProperties({ title: (meta && meta.title) || 'Dokumen', creator: 'Annur Docs' });
      return new Uint8Array(pdf.output('arraybuffer'));
    } finally { host.remove(); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
