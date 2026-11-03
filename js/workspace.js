(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});
  const str = (v) => (v == null ? '' : String(v)).trim();

  // Kemas kini/tambah kunci dalam tab kunci/nilai. Pulang entri `data` untuk values.batchUpdate.
  AI.kvUpsert = (tab, values, updates, notes) => {
    const rows = values || [];
    const head = (rows[0] || []).map(str);
    const kc = head.indexOf('kunci'), vc = head.indexOf('nilai'), nc = head.indexOf('keterangan');
    const at = {};
    for (let i = 1; i < rows.length; i++) { const k = str((rows[i] || [])[kc]); if (k && !(k in at)) at[k] = i + 1; }
    let next = Math.max(rows.length, 1) + 1;
    const data = [];
    Object.keys(updates).forEach((k) => {
      const v = updates[k] == null ? '' : String(updates[k]);
      if (at[k]) { data.push({ range: AI.range(tab, AI.colLetter(vc + 1) + at[k]), values: [[v]] }); return; }
      const row = []; row[kc] = k; row[vc] = v; if (nc >= 0) row[nc] = (notes && notes[k]) || '';
      data.push({ range: AI.range(tab, 'A' + next), values: [head.map((_, j) => (row[j] == null ? '' : row[j]))] });
      at[k] = next++;
    });
    return data;
  };

  // Nama folder & Sheet ikut nama syarikat pengguna (pilihan A): "AZN POWER SOLUTION – Annur Invoice"
  AI.cleanName = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 60).trim();
  AI.workspaceName = (company) => { const n = AI.cleanName(company); return n ? n + ' – ' + AI.ROOT_FOLDER : AI.ROOT_FOLDER; };

  // Cari ruang kerja sedia ada TANPA mencipta apa-apa. Pulang { id, rootId, duplicates } atau null.
  AI.findWorkspace = async (api, opts) => {
    opts = opts || {};
    if (opts.cachedId) {
      try { const info = await api.info(opts.cachedId); return { id: info.id, duplicates: 0 }; }
      catch (e) { if (![403, 404].includes(e.status)) throw e; }
    }
    const found = await api.findByMark('master', AI.MIME_SHEET);
    return found.length ? { id: found[0].id, duplicates: found.length - 1 } : null;
  };

  // Tukar nama folder induk dan Sheet (bila nama syarikat diubah dalam Tetapan, atas persetujuan pengguna)
  AI.renameWorkspace = async (api, ws, company) => {
    const name = AI.workspaceName(company);
    await api.updateFile(ws.id, { name });
    if (ws.folders && ws.folders.root) await api.updateFile(ws.folders.root, { name });
    return name;
  };

  function formatRequests(sheetId, tab, head) {
    const reqs = [
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
      { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.906, green: 0.929, blue: 0.984 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } }
    ];
    const col = (name) => head.indexOf(name);
    const fmt = AI.TAB_FORMAT[tab] || {};
    const cellFmt = (names, numberFormat) => (names || []).forEach((n) => {
      const c = col(n); if (c < 0) return;
      reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 }, cell: { userEnteredFormat: { numberFormat } }, fields: 'userEnteredFormat.numberFormat' } });
    });
    cellFmt(fmt.text, { type: 'TEXT' });
    cellFmt(fmt.money, { type: 'NUMBER', pattern: '#,##0.00' });
    Object.entries(AI.TAB_ENUMS[tab] || {}).forEach(([name, list]) => {
      const c = col(name); if (c < 0) return;
      reqs.push({ setDataValidation: { range: { sheetId, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 },
        rule: { condition: { type: 'ONE_OF_LIST', values: list.filter(Boolean).map((v) => ({ userEnteredValue: v })) }, strict: false, showCustomUi: true } } });
    });
    return reqs;
  }

  /**
   * Cipta atau jumpa semula ruang kerja pengguna (docs/05-BSD.md §6). Idempotent: tidak menimpa nilai
   * sedia ada dan tidak memadam data.
   * opts: { cachedId, company, title, folderName, email, writer, now }
   *   company → nama folder & Sheet "<company> – Annur Invoice" (hanya semasa dicipta; tidak menukar nama sedia ada)
   * Pulang { id, url, title, folders, created, addedTabs, migrated, duplicates }
   */
  AI.ensureWorkspace = async (api, opts) => {
    opts = opts || {};
    const nowIso = new Date(opts.now != null ? opts.now : Date.now()).toISOString();
    const out = { created: false, addedTabs: [], migrated: [], duplicates: 0, folders: {} };
    const wsName = opts.folderName ? AI.cleanName(opts.folderName, 100) : AI.workspaceName(opts.company);

    // 1) folder induk (ditanda appProperties supaya tidak tersalah jumpa folder lain bernama sama)
    let rootFolder = (await api.findByMark('root', AI.MIME_FOLDER))[0];
    if (!rootFolder) rootFolder = await api.createFolder(wsName, null, 'root');
    out.folders.root = rootFolder.id;

    // 2) Sheet induk: id cache → cari ikut tanda → cipta
    let info = null;
    if (opts.cachedId) {
      try { info = await api.info(opts.cachedId); } catch (e) { if (![403, 404].includes(e.status)) throw e; }
    }
    if (!info) {
      const found = await api.findByMark('master', AI.MIME_SHEET);
      out.duplicates = Math.max(0, found.length - 1);
      if (found.length) info = await api.info(found[0].id);
    }
    if (!info) {
      const f = await api.createFile({ name: opts.title || wsName, mimeType: AI.MIME_SHEET, parents: [rootFolder.id], appProperties: { [AI.APP_MARK]: 'master' } });
      info = await api.info(f.id);
      out.created = true;
    }
    const id = info.id;

    // 3) tab yang belum wujud
    const have = new Set(info.tabs.map((t) => t.title));
    const missing = AI.TAB_ORDER.filter((t) => !have.has(t));
    if (missing.length) {
      const reqs = missing.map((t) => ({ addSheet: { properties: { title: t } } }));
      // fail baharu: buang tab lalai Google ("Sheet1"/"Helaian1") selepas tab kita ditambah
      if (out.created) info.tabs.filter((t) => !AI.TABS[t.title]).forEach((t) => reqs.push({ deleteSheet: { sheetId: t.id } }));
      await api.batchUpdate(id, reqs);
      info = await api.info(id);
      out.addedTabs = missing;
    }
    const sheetIdOf = {}; info.tabs.forEach((t) => { sheetIdOf[t.title] = t.id; });

    // 4) tajuk lajur: tulis jika kosong, tambah lajur baharu di hujung (migrate), jangan susun semula
    const vals = await api.batchGet(id, AI.TAB_ORDER);
    const data = [];
    const fmtReqs = [];
    const headOf = {};
    AI.TAB_ORDER.forEach((tab) => {
      const want = AI.TABS[tab];
      const cur = ((vals[tab] || [])[0] || []).map(str);
      let head;
      if (!cur.some(Boolean)) {
        head = want.slice();
        data.push({ range: AI.range(tab, 'A1'), values: [head] });
      } else {
        const add = want.filter((h) => !cur.includes(h));
        head = cur.concat(add);
        if (add.length) {
          data.push({ range: AI.range(tab, AI.colLetter(cur.length + 1) + '1'), values: [add] });
          out.migrated.push({ tab, cols: add });
        }
      }
      headOf[tab] = head;
      if (out.addedTabs.includes(tab)) fmtReqs.push(...formatRequests(sheetIdOf[tab], tab, head));
    });
    // nilai semasa dengan tajuk terkini (untuk upsert kunci/nilai)
    const withHead = (tab) => [headOf[tab]].concat((vals[tab] || []).slice(1));

    // 5) seed Syarikat (kunci yang belum ada sahaja) dan KodCukai (tab baharu sahaja)
    const sk = AI.kvOf(withHead('Syarikat'));
    const seed = {}, notes = {};
    AI.SYARIKAT_DEFAULTS.forEach(([k, v, n]) => { if (!(k in sk)) { seed[k] = k === 'dikemaskini' ? nowIso : v; notes[k] = n; } });
    if (Object.keys(seed).length) data.push(...AI.kvUpsert('Syarikat', withHead('Syarikat'), seed, notes));
    if (out.addedTabs.includes('KodCukai')) {
      data.push({ range: AI.range('KodCukai', 'A2'), values: AI.KODCUKAI_SEED.map((r) => AI.objectToRow(headOf.KodCukai, { kod: r[0], nama: r[1], kadar: r[2], jenis: r[3], aktif: r[4] })) });
    }

    // 6) subfolder (id disimpan dalam Meta; cari/cipta hanya jika belum ada)
    const meta = AI.kvOf(withHead('Meta'));
    const FKEY = { invoice: 'folder_invois', quotation: 'folder_quotation', do: 'folder_do', settings: 'folder_tetapan' };
    for (const k of Object.keys(AI.FOLDERS)) {
      let fid = str(meta[FKEY[k]]);
      if (!fid || str(meta.folder_akar) !== rootFolder.id) {
        const f = (await api.findChildFolder(rootFolder.id, AI.FOLDERS[k])) || (await api.createFolder(AI.FOLDERS[k], rootFolder.id));
        fid = f.id;
      }
      out.folders[k] = fid;
    }

    // 7) Meta
    const metaUpd = { format: Math.max(AI.SHEET_FORMAT, Number(meta.format) || 0), aplikasi: 'Annur Invoice', folder_akar: rootFolder.id };
    Object.keys(FKEY).forEach((k) => { metaUpd[FKEY[k]] = out.folders[k]; });
    if (out.created || missing.length || out.migrated.length || !meta.dikemaskini) Object.assign(metaUpd, { dikemaskini: nowIso, oleh: opts.email || '', penulis: opts.writer || '' });
    data.push(...AI.kvUpsert('Meta', withHead('Meta'), metaUpd));

    if (data.length) await api.setValues(id, data);
    if (fmtReqs.length) await api.batchUpdate(id, fmtReqs);
    return Object.assign(out, { id, url: info.url, title: info.title });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
