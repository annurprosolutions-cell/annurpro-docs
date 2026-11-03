(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});

  AI.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ISO YYYY-MM-DD → DD/MM/YYYY
  AI.fmtDate = (iso) => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
  };

  AI.fmtRM = (n) => 'RM' + (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  AI.initials = (s) => String(s || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('') || '?';

  // storan selamat: tidak melontar dalam mod peribadi / storan disekat
  const safe = (kind) => ({
    get(k, d) { try { const v = root[kind].getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { root[kind].setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
    del(k) { try { root[kind].removeItem(k); } catch (e) { /* abaikan */ } }
  });
  AI.local = safe('localStorage');
  AI.session = safe('sessionStorage');

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
