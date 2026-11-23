// Read an .xlsx in the browser: unzip (DecompressionStream) and read the sheet XML.
// readXlsx(arrayBuffer) -> Promise<[{name, rows: [[cell text, ...], ...]}]>; numbers keep the cell's 0.000-style format.
(function () {
  function inflate(bytes) {
    var ds = new DecompressionStream('deflate-raw');
    return new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function unzip(buf) {
    var v = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder(), files = {};
    var e = buf.byteLength - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) return Promise.reject('not a zip');
    var n = v.getUint16(e + 10, true), p = v.getUint32(e + 16, true), jobs = [];
    for (var i = 0; i < n; i++) {
      var method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
      var nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      var off = v.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      var start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      var data = u8.subarray(start, start + csize);
      jobs.push((method === 8 ? inflate(data) : Promise.resolve(data)).then(function (nm) {
        return function (d) { files[nm] = dec.decode(d); };
      }(name)));
      p += 46 + nl + xl + cl;
    }
    return Promise.all(jobs).then(function () { return files; });
  }
  function xml(s) { return new DOMParser().parseFromString(s || '<x/>', 'application/xml'); }
  function tags(node, name) { return Array.prototype.slice.call(node.getElementsByTagNameNS('*', name)); }
  function colIdx(ref) { var m = /^[A-Z]+/.exec(ref)[0], n = 0; for (var i = 0; i < m.length; i++) n = n * 26 + m.charCodeAt(i) - 64; return n - 1; }
  function readXlsx(buf) {
    return unzip(buf).then(function (f) {
      var shared = tags(xml(f['xl/sharedStrings.xml']), 'si').map(function (si) {
        return tags(si, 't').map(function (t) { return t.textContent; }).join('');
      });
      // number formats → decimals per style index
      var st = xml(f['xl/styles.xml']), codes = { 1: '0', 2: '0.00' };
      tags(st, 'numFmt').forEach(function (nf) { codes[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode'); });
      var xfs = tags(st, 'cellXfs')[0], dps = xfs ? tags(xfs, 'xf').map(function (xf) {
        var c = codes[xf.getAttribute('numFmtId')], m = c && /^0(?:\.(0+))?$/.exec(c);
        return m ? (m[1] || '').length : null;
      }) : [];
      var rels = {};
      tags(xml(f['xl/_rels/workbook.xml.rels']), 'Relationship').forEach(function (r) { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
      return tags(xml(f['xl/workbook.xml']), 'sheet').map(function (sh) {
        var t = rels[sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')] || '';
        t = t.replace(/^\/?xl\//, '').replace(/^\//, '');
        var rows = [];
        tags(xml(f['xl/' + t]), 'row').forEach(function (r) {
          var row = [];
          tags(r, 'c').forEach(function (c) {
            var ty = c.getAttribute('t'), vEl = tags(c, 'v')[0], val = vEl ? vEl.textContent : '';
            if (ty === 's') val = shared[+val] || '';
            else if (ty === 'inlineStr') val = tags(c, 't').map(function (x) { return x.textContent; }).join('');
            else if (ty !== 'str' && ty !== 'b' && ty !== 'e' && val !== '') {
              var d = dps[+(c.getAttribute('s') || 0)], num = +val;
              val = d != null ? num.toFixed(d) : String(Math.round(num * 1e4) / 1e4);
            }
            row[c.getAttribute('r') ? colIdx(c.getAttribute('r')) : row.length] = val;
          });
          rows.push(row);
        });
        return { name: sh.getAttribute('name'), rows: rows };
      });
    });
  }
  window.readXlsx = readXlsx;
})();
