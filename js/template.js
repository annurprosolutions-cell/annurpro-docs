(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});

  /**
   * Templat A4 (794 × 1123 px pada 96 dpi) untuk Invois, Quotation dan DO.
   * view: AI.docView(...) ; assets: { logo: url|null, sign: HTML ruang tandatangan statik }
   * Pulang HTML semua halaman. Gaya dalam css/doc.css (kelas dv-*), dikongsi pratonton dan PDF.
   */
  AI.renderDoc = (v, assets) => AI.renderDocPages(v, assets).join('');
  AI.renderDocPages = (v, assets) => {
    assets = assets || {};
    const esc = AI.esc;
    const pages = AI.paginate(v);
    const doo = v.jenis === 'do';
    const cols = doo
      ? [['No', 'c-no'], ['Description', 'c-desc'], ['Qty', 'c-qty'], ['Unit', 'c-unit']]
      : [['No', 'c-no'], ['Description', 'c-desc'], ['Qty', 'c-qty'], ['Unit', 'c-unit'], ['Price (RM)', 'c-num']]
        .concat(v.showDisc ? [['Disc (RM)', 'c-num']] : []).concat(v.showTax ? [['Tax', 'c-tax']] : []).concat([['Amount (RM)', 'c-num']]);
    const row = (r) => `<tr><td class="c-no">${r.n}</td><td class="c-desc">${esc(r.desc).replace(/\n/g, '<br>')}</td><td class="c-qty">${esc(r.qty)}</td><td class="c-unit">${esc(r.unit)}</td>${doo ? ''
      : `<td class="c-num">${esc(r.price)}</td>${v.showDisc ? `<td class="c-num">${esc(r.disc)}</td>` : ''}${v.showTax ? `<td class="c-tax">${esc(r.tax)}</td>` : ''}<td class="c-num">${esc(r.amount)}</td>`}</tr>`;

    const coLine = [v.co.tel && 'Tel: ' + esc(v.co.tel), v.co.email && esc(v.co.email), v.co.web && esc(v.co.web)].filter(Boolean).join(' &nbsp;|&nbsp; ');
    const ids = [v.co.sst && 'SST No: ' + esc(v.co.sst), v.co.tin && 'TIN: ' + esc(v.co.tin)].filter(Boolean).join(' &nbsp;|&nbsp; ');
    const head = `<header class="dv-head">
        <div class="dv-logo">${assets.logo ? `<img src="${esc(assets.logo)}" alt="">` : ''}</div>
        <div class="dv-co"><div class="dv-coname">${esc(v.co.name || 'COMPANY NAME')}${v.co.reg ? ` <span>(${esc(v.co.reg)})</span>` : ''}</div>
          ${v.co.address.map((l) => `<div>${esc(l)}</div>`).join('')}${coLine ? `<div>${coLine}</div>` : ''}${ids ? `<div>${ids}</div>` : ''}</div>
      </header>
      <div class="dv-titlebar"><h1>${esc(v.title)}</h1></div>`;
    const party = (label, p) => `<div class="dv-party"><div class="dv-lbl">${label}</div><div class="dv-pname">${esc(p.name)}</div>${p.address.map((l) => `<div>${esc(l)}</div>`).join('')}
      ${p.tel ? `<div>Tel: ${esc(p.tel)}</div>` : ''}${p.attn ? `<div>Attn: ${esc(p.attn)}</div>` : ''}</div>`;
    const meta = `<section class="dv-meta">${party(doo ? 'Deliver To' : 'Bill To', doo && v.ship ? v.ship : v.bill)}
      ${doo && v.ship ? party('Bill To', v.bill) : ''}
      <table class="dv-mt">${v.meta.map(([k, val]) => `<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`).join('')}</table></section>`;
    const compact = (p) => `<header class="dv-cont"><b>${esc(v.co.name)}</b><span>${esc(v.title)} ${esc(v.number)} &nbsp;(continued)</span></header>`;

    const totals = doo
      ? `<div class="dv-qty">Total quantity: <b>${esc(v.totals.qty)}</b></div>`
      : `<div class="dv-totals"><table>
          <tr><th>Subtotal</th><td>${esc(v.totals.subtotal)}</td></tr>
          ${v.totals.taxes.map((t) => `<tr><th>${esc(t.label)}<small> on ${esc(t.base)}</small></th><td>${esc(t.amount)}</td></tr>`).join('')}
          <tr class="dv-grand"><th>TOTAL (RM)</th><td>${esc(v.totals.total)}</td></tr></table></div>
        <div class="dv-words">${esc(v.totals.words)}</div>`;
    const notes = v.notes.length ? `<div class="dv-notes"><div class="dv-lbl">Notes</div><ol>${v.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ol></div>` : '';
    const bank = v.bank ? `<div class="dv-bank"><div class="dv-lbl">Payment</div><div>${esc(v.bank.name)} &nbsp;<b>${esc(v.bank.acc)}</b></div><div>${esc(v.bank.holder)}</div></div>` : '';
    const signBlock = (label, s, withImg) => `<div class="dv-signer"><div class="dv-sarea">${withImg ? assets.sign || '' : ''}</div>
      <div class="dv-sline"></div><div class="dv-sname">${esc(s.name || '')}</div><div>${esc(s.title || '')}</div>${s.tel ? `<div>Tel: ${esc(s.tel)}</div>` : ''}<div class="dv-lbl">${label}</div></div>`;
    const sign = `<div class="dv-signs">${signBlock(doo ? 'Issued By' : 'Authorised Signature', v.signer, true)}
      ${v.received ? signBlock('Received By (Name, Signature, Date & Company Stamp)', {}, false) : ''}</div>`;
    const foot = `<section class="dv-foot">${totals}<div class="dv-fgrid">${notes}${bank}</div>${sign}</section>`;

    return pages.map((p) => `<div class="a4" style="--acc:${AI.esc(v.accent)}"><div class="dv-page">
        ${p.no === 1 ? head + meta : compact(p)}
        ${p.rows.length || p.no === 1 ? `<table class="dv-items"><thead><tr>${cols.map(([t, c]) => `<th class="${c}">${t}</th>`).join('')}</tr></thead>
          <tbody>${p.rows.map((i) => row(v.rows[i])).join('') || `<tr><td class="dv-empty" colspan="${cols.length}">No items yet</td></tr>`}</tbody></table>` : ''}
        ${p.last ? foot : ''}
        <footer class="dv-pf"><span>This is a computer-generated document.</span><span>Page ${p.no} of ${p.of}</span></footer>
      </div>${v.isDraft ? '<div class="dv-draft" aria-hidden="true">DRAF</div>' : ''}</div>`);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
