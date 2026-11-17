// Minimal .xlsx writer for downloads made in the browser. Every cell is written as text with the
// Text (@) format, so Excel leaves sample names like 8551-03 or 1E5 alone.
// makeXlsx([{name: 'Sheet', rows: [[...], ...], widths: [12, 20, ...]}]) -> Blob  (needs zip.js)
(function () {
  function x(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); }
  function col(i) { var s = ''; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; }
  window.makeXlsx = function (sheets) {
    var enc = new TextEncoder(), files = [];
    function add(name, text) { files.push({ name: name, data: enc.encode(text) }); }
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    add('[Content_Types].xml', head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>');
    add('_rels/.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    add('xl/workbook.xml', head + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(function (s, i) { return '<sheet name="' + x(s.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>');
    add('xl/_rels/workbook.xml.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    add('xl/styles.xml', head + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    sheets.forEach(function (s, i) {
      var cols = s.widths ? '<cols>' + s.widths.map(function (w, j) { return '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w + '" style="0" customWidth="1"/>'; }).join('') + '</cols>' : '';
      var body = s.rows.map(function (r, ri) {
        return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) {
          return '<c r="' + col(ci) + (ri + 1) + '" t="inlineStr" s="' + (ri === 0 ? 1 : 0) + '"><is><t xml:space="preserve">' + x(v) + '</t></is></c>';
        }).join('') + '</row>';
      }).join('');
      add('xl/worksheets/sheet' + (i + 1) + '.xml', head + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' + cols + '<sheetData>' + body + '</sheetData></worksheet>');
    });
    var b = makeZip(files);
    return new Blob([b], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };
})();
