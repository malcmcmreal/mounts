// Mount page: draws the mount's address as several kinds of 2D code,
// each with a short description and SVG / PNG downloads.
(function () {
  var section = document.getElementById('codes');
  if (!section || !window.qrcode) return;

  var text = section.dataset.text;
  var mountId = section.dataset.id;
  var MM = 0.3; // mm per square, used for the "printed size" estimate
  var alnum = /^[0-9A-Z $%*+\-.\/:]*$/.test(text);
  var ECC = { L: '~7%', M: '~15%', Q: '~25%', H: '~30%' };
  var bw = window.bwip;

  // ---------- drawing helpers ----------
  function wrap(w, h, quiet, body) {
    var W = w + 2 * quiet, H = h + 2 * quiet;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" ' +
      'width="' + W * 10 + '" height="' + H * 10 + '">' +
      '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' +
      '<g transform="translate(' + quiet + ' ' + quiet + ')" fill="#000">' + body + '</g></svg>';
  }

  // Square modules from qrcode-generator
  function qrSquares(qr, quiet) {
    var n = qr.getModuleCount(), d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
      if (qr.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return wrap(n, n, quiet, '<path shape-rendering="crispEdges" d="' + d + '"/>');
  }

  // Dots, with rounded finder patterns
  function qrRound(qr, quiet) {
    var n = qr.getModuleCount(), out = '';
    function inFinder(r, c) {
      return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    }
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
      if (qr.isDark(r, c) && !inFinder(r, c))
        out += '<circle cx="' + (c + .5) + '" cy="' + (r + .5) + '" r=".46"/>';
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (p) {
      var y = p[0], x = p[1];
      out += '<rect x="' + (x + .5) + '" y="' + (y + .5) + '" width="6" height="6" rx="1.8" fill="none" stroke="#000" stroke-width="1"/>' +
             '<rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" rx="1"/>';
    });
    return wrap(n, n, quiet, out);
  }

  // Output of bwip-js (2 units per module) re-wrapped with our own margin
  function fromBwip(fn, opts, quiet) {
    opts.text = text; opts.scale = 1;
    var svg = fn(opts, bw.drawingSVG());
    var vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    var w = +vb[1] / 2, h = +vb[2] / 2;
    var d = svg.match(/ d="([^"]+)"/)[1];
    return {
      w: w, h: h,
      svg: wrap(w, h, quiet, '<path transform="scale(.5)" fill-rule="evenodd" shape-rendering="crispEdges" d="' + d + '"/>')
    };
  }

  function size(w, h, quiet) {
    var W = ((w + 2 * quiet) * MM).toFixed(1), H = ((h + 2 * quiet) * MM).toFixed(1);
    return (W === H ? W + ' mm square' : W + ' × ' + H + ' mm') +
      ' at ' + MM + ' mm per square, including the margin';
  }

  // ---------- the codes ----------
  var codes = [];

  // 1. Standard QR
  (function () {
    var qr = qrcode(0, 'M');
    qr.addData(text, alnum ? 'Alphanumeric' : 'Byte');
    qr.make();
    var n = qr.getModuleCount();
    codes.push({
      key: 'QR', title: 'Standard QR',
      svg: qrSquares(qr, 4),
      info: [
        'Version ' + (n - 17) / 4 + ' · ' + n + '×' + n + ' squares',
        'Error correction M (recovers ' + ECC.M + ' damage)',
        size(n, n, 4),
        'Reads in every phone camera app. Needs a clear margin of 4 squares.'
      ]
    });
  })();

  // 2. Rounded QR
  (function () {
    var qr = qrcode(0, 'Q');
    qr.addData(text, alnum ? 'Alphanumeric' : 'Byte');
    qr.make();
    var n = qr.getModuleCount();
    codes.push({
      key: 'QR-round', title: 'Rounded QR',
      svg: qrRound(qr, 4),
      info: [
        'Version ' + (n - 17) / 4 + ' · ' + n + '×' + n + ' squares',
        'Error correction Q (recovers ' + ECC.Q + ' damage), raised to make up for the round dots',
        size(n, n, 4),
        'A standard QR code drawn with dots and rounded corners. Reads in phone camera apps; print it a little larger than the square version.'
      ]
    });
  })();

  // 3. Micro QR: smallest symbol that fits, preferring stronger error correction
  (function () {
    var best = null;
    if (bw) ['Q', 'M', 'L'].forEach(function (ec) {
      try {
        var r = fromBwip(bw.microqrcode, { eclevel: ec }, 2);
        if (!best || r.w < best.w) { best = r; best.ec = ec; }
      } catch (e) { /* doesn't fit at this level */ }
    });
    if (best) {
      codes.push({
        key: 'MicroQR', title: 'Micro QR',
        svg: best.svg,
        info: [
          'Version M' + (best.w - 9) / 2 + ' · ' + best.w + '×' + best.w + ' squares',
          'Error correction ' + best.ec + ' (recovers ' + ECC[best.ec] + ' damage)',
          size(best.w, best.w, 2),
          'Only one corner marker and a 2-square margin, so it is the smallest QR type. Most phone cameras can\'t read it: you need a scanner app that supports Micro QR.'
        ]
      });
    } else {
      codes.push({
        key: 'MicroQR', title: 'Micro QR',
        empty: 'Not possible with this address',
        info: [
          'This address is ' + text.length + ' characters. Micro QR holds at most ' +
            (alnum ? '35 characters of capitals-only text' : '15 characters when the text has lowercase letters') + '.',
          'Set a short capitals-only address (qr_base in _config.yml, e.g. HTTP://XTL.AU) and it will fit.'
        ]
      });
    }
  })();

  // 4. Rectangular Micro QR (rMQR): smallest-area version that fits
  (function () {
    var rows = [7, 9, 11, 13, 15, 17], cols = [43, 59, 77, 99, 139], vs = [];
    rows.forEach(function (r) { cols.forEach(function (c) { vs.push([r, c]); }); });
    vs.push([11, 27], [13, 27]);
    vs.sort(function (a, b) { return a[0] * a[1] - b[0] * b[1]; });
    var res = null;
    if (bw) for (var i = 0; i < vs.length && !res; i++) {
      try { res = fromBwip(bw.rectangularmicroqrcode, { version: 'R' + vs[i][0] + 'x' + vs[i][1], eclevel: 'M' }, 2); }
      catch (e) { /* try the next size */ }
    }
    codes.push(res ? {
      key: 'rMQR', title: 'Rectangular Micro QR (rMQR)',
      svg: res.svg, wide: true,
      info: [
        'Version R' + res.h + 'x' + res.w + ' · ' + res.w + '×' + res.h + ' squares',
        'Error correction M (recovers ' + ECC.M + ' damage)',
        size(res.w, res.h, 2),
        'A long, thin code for a narrow strip, such as the side or edge of a mount. It is a newer standard (2022), so few phone apps read it yet.'
      ]
    } : {
      key: 'rMQR', title: 'Rectangular Micro QR (rMQR)',
      empty: 'Not possible with this address',
      info: ['This address (' + text.length + ' characters) is too long for any rMQR size.']
    });
  })();

  // 5. Data Matrix
  (function () {
    if (!bw) return;
    try {
      var r = fromBwip(bw.datamatrix, {}, 1);
      codes.push({
        key: 'DataMatrix', title: 'Data Matrix',
        svg: r.svg,
        info: [
          r.w + '×' + r.h + ' squares',
          'Error correction built in (Reed–Solomon)',
          size(r.w, r.h, 1),
          'The usual code for marking small parts and lab tubes. Very compact and needs only a 1-square margin. Read by most scanner apps, but not every phone camera app.'
        ]
      });
    } catch (e) {}
  })();

  // 6. Aztec
  (function () {
    if (!bw) return;
    try {
      var r = fromBwip(bw.azteccode, {}, 0);
      codes.push({
        key: 'Aztec', title: 'Aztec',
        svg: r.svg,
        info: [
          r.w + '×' + r.h + ' squares',
          'Error correction 23% (default)',
          size(r.w, r.h, 0),
          'Has a bullseye in the centre and needs no margin, so it can fill a small space edge to edge. Used on boarding passes. Read by most scanner apps; Android cameras usually read it.'
        ]
      });
    } catch (e) {}
  })();

  // ---------- page output ----------
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // The wide rMQR goes last so it doesn't break up the grid
  codes = codes.filter(function (c) { return !c.wide; }).concat(codes.filter(function (c) { return c.wide; }));
  var grid = section.querySelector('.codes');
  grid.innerHTML = codes.map(function (c, i) {
    return '<figure class="code' + (c.wide ? ' wide' : '') + '">' +
      (c.empty
        ? '<div class="code-img code-empty"><span>' + esc(c.empty) + '</span></div>'
        : '<div class="code-img">' + c.svg + '</div>') +
      '<figcaption><strong>' + esc(c.title) + '</strong>' +
      '<ul>' + c.info.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      (c.empty ? '' :
        '<div class="code-dl"><button type="button" class="btn small" data-i="' + i + '" data-fmt="svg">SVG</button>' +
        '<button type="button" class="btn small" data-i="' + i + '" data-fmt="png">PNG</button></div>') +
      '</figcaption></figure>';
  }).join('');

  // Small standard code in the side card
  var side = document.getElementById('qr');
  if (side) side.innerHTML = codes[0].svg;

  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function download(c, fmt) {
    var name = mountId + '_' + c.key;
    var blob = new Blob([c.svg], { type: 'image/svg+xml' });
    if (fmt === 'svg') return save(blob, name + '.svg');
    // PNG: 20 pixels per square
    var vb = c.svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = vb[1] * 20; cv.height = vb[2] * 20;
      var ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(function (b) { save(b, name + '.png'); }, 'image/png');
    };
    img.src = URL.createObjectURL(blob);
  }
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-fmt]');
    if (b) download(codes[+b.dataset.i], b.dataset.fmt);
  });
  var sideBtn = document.getElementById('qr-download');
  if (sideBtn) sideBtn.addEventListener('click', function () { download(codes[0], 'svg'); });
})();
