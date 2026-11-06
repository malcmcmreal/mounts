// Mount page: draws the mount's address as several kinds of 2D code,
// each with a short description and SVG / PNG downloads.
// MountCodes.make() is also used by the home page to download codes for several mounts.
(function () {
  if (!window.qrcode) return;

  var MM = 0.3; // mm per square, used for the "printed size" estimate
  var ECC = { L: '~7%', M: '~15%', Q: '~25%', H: '~30%' };
  var text, bw;   // set by make() for the mount being drawn

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

  // Short mineral codes for the label (accessory minerals first; others get their first two letters)
  var MINERALS = { apatite: 'Ap', zircon: 'Zr', monazite: 'Mn', titanite: 'Ti', sphene: 'Ti', rutile: 'Rt',
    xenotime: 'Xt', allanite: 'Aln', baddeleyite: 'Bdy', garnet: 'Grt', epidote: 'Ep', quartz: 'Qz',
    feldspar: 'Fsp', 'k-feldspar': 'Kfs', plagioclase: 'Pl', biotite: 'Bt', muscovite: 'Ms', hornblende: 'Hbl',
    magnetite: 'Mag', pyrite: 'Py', calcite: 'Cal', olivine: 'Ol', pyroxene: 'Px', goethite: 'Gth', hematite: 'Hem' };
  function mineralCodes(s) {
    return s.split(/\s*(?:,|;|\/|&|\+|\band\b)\s*/i).map(function (m) {
      m = m.trim().toLowerCase();
      if (!m) return '';
      if (MINERALS[m]) return MINERALS[m];
      var hit = Object.keys(MINERALS).filter(function (k) { return m.indexOf(k) !== -1; })[0];
      return hit ? MINERALS[hit] : m.charAt(0).toUpperCase() + m.slice(1, 2);
    }).filter(Boolean).join('/');
  }
  // "University of Melbourne" -> "UoM"; short names are kept as they are
  var AFFILIATIONS = { 'university of melbourne': 'UoM', 'the university of melbourne': 'UoM' };
  function shortAffiliation(a) {
    a = a.trim();
    if (!a) return '';
    if (AFFILIATIONS[a.toLowerCase()]) return AFFILIATIONS[a.toLowerCase()];
    if (a.length <= 12) return a;
    return a.split(/\s+/).map(function (w) {
      return /^(of|and|the|for|de|du|la)$/i.test(w) ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase();
    }).join('');
  }
  // Shrink lines that are too long for the label; short lines keep their size and leave space on the right
  function fitText(lines, room) {
    var ns = 'http://www.w3.org/2000/svg';
    var probe = document.createElementNS(ns, 'svg');
    probe.setAttribute('style', 'position:absolute;left:-9999px;top:0;visibility:hidden');
    document.body.appendChild(probe);
    var widths = [];
    var sizes = lines.map(function (l) {
      if (!l[0]) { widths.push(0); return l[1]; }
      var t = document.createElementNS(ns, 'text');
      t.setAttribute('font-family', 'Helvetica Neue, Helvetica, Arial, sans-serif');
      t.setAttribute('font-size', l[1]); t.setAttribute('font-weight', l[2]);
      t.textContent = l[0];
      probe.appendChild(t);
      var w = t.getComputedTextLength() || 0;
      widths.push(w);
      return room && w > room ? +(l[1] * room / w).toFixed(2) : l[1];
    });
    probe.remove();
    fitText.widths = widths;
    return sizes;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------- the codes ----------
  // o: { text, id, year, minerals, affiliation, nsamples }
  function make(o) {
  text = o.text; bw = window.bwip;
  var mountId = o.id;
  var alnum = /^[0-9A-Z $%*+\-.\/:]*$/.test(text);
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

  // 2. Puck mount label: standard QR on the left, two lines of text to its right,
  //    1 : 8.75 overall, for wrapping around the side of a round (puck) mount.
  //    Line 2 default: minerals · samples · year · short affiliation · readable address.
  //    Both lines can be edited on the page before downloading.
  (function () {
    var qr = qrcode(0, 'M');
    qr.addData(text, alnum ? 'Alphanumeric' : 'Byte');
    qr.make();
    var n = qr.getModuleCount(), quiet = 2, H = n + 2 * quiet, W = H * 8.75;
    var off = +(W * 3 / 65.6).toFixed(2);             // left margin: 3 mm when printed 65.6 mm long
    var x0 = off + H + 1, room = W - x0 - 1.5;
    var d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
      if (qr.isDark(r, c)) d += 'M' + (off + c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
    var font = 'Helvetica Neue, Helvetica, Arial, sans-serif';

    var ns = +o.nsamples || 0;
    var address = /^https?:\/\//i.test(text) ? text.replace(/^https?:\/\//i, '').replace(/\/$/, '') : '';
    if (address.length > 24) address = '';            // too long to be worth printing
    else address = address.toLowerCase().replace(/\/[^/]*$/, '/' + mountId);
    var line2 = [mineralCodes(o.minerals || ''),
      ns ? ns + ' sample' + (ns === 1 ? '' : 's') : '',
      o.year, shortAffiliation(o.affiliation || ''), address]
      .map(function (x) { return (x || '').trim(); }).filter(Boolean).join(' · ');

    function build(l1, l2) {
      var fit = fitText([[l1, 11, 700], [l2, 6.5, 400]], room);
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W * 10 + '" height="' + H * 10 + '">' +
        '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' +
        '<path fill="#000" shape-rendering="crispEdges" d="' + d + '"/>' +
        (l1 ? '<text x="' + x0 + '" y="' + (quiet + 0.73 * fit[0]) + '" font-family="' + font + '" font-weight="700" font-size="' + fit[0] + '" fill="#000">' + esc(l1) + '</text>' : '') +
        (l2 ? '<text x="' + x0 + '" y="' + (H - quiet) + '" font-family="' + font + '" font-size="' + fit[1] + '" fill="#000">' + esc(l2) + '</text>' : '') +
        '</svg>';
    }
    codes.push({
      key: 'PuckLabel', title: 'Puck mount QR', svg: build(mountId, line2), wide: true, label: true,
      build: build, line1: mountId, line2: line2,
      info: [
        'Standard QR, version ' + (n - 17) / 4 + ' (' + n + '×' + n + ' squares), with the mount ID and details beside it',
        'Proportions 1 : 8.75, for wrapping around the side of a puck mount',
        'At ' + MM + ' mm per square: ' + (H * MM).toFixed(1) + ' mm tall × ' + (W * MM).toFixed(1) + ' mm long. ' +
          'Scale it to the height of your mount\'s side; the QR stays readable down to about 0.25 mm per square.'
      ]
    });
  })();

  // 3. Round label: standard QR in the middle, text around it on two arcs
  //    (mount ID over the top, details around the bottom), for the back of a puck mount.
  //    There is no standard circular QR code that phones read, so this keeps a normal QR.
  (function () {
    var puck = codes.filter(function (c) { return c.label; })[0];
    var qr = qrcode(0, 'M');
    qr.addData(text, alnum ? 'Alphanumeric' : 'Byte');
    qr.make();
    var n = qr.getModuleCount(), quiet = 2, Q = n + 2 * quiet;
    var half = Q / 2, corner = half * Math.SQRT2;          // QR corners sit this far from the centre
    var rTop = corner + 1.2, rBot = corner + 4.9, R = corner + 6.6, S = 2 * R + 1, c0 = S / 2;
    var d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
      if (qr.isDark(r, c)) d += 'M' + (c0 - half + c + quiet) + ' ' + (c0 - half + r + quiet) + 'h1v1h-1z';
    var font = 'Helvetica Neue, Helvetica, Arial, sans-serif';
    function build(l1, l2) {
      var fit = fitText([[l1, 4.6, 700], [l2, 3.1, 400]], 0);
      var w = fitText.widths;
      // shrink each line to the arc space it has (top ~120°, bottom ~200°)
      var s1 = w[0] > rTop * 2.1 ? +(4.6 * rTop * 2.1 / w[0]).toFixed(2) : 4.6;
      var s2 = w[1] > rBot * 3.4 ? +(3.1 * rBot * 3.4 / w[1]).toFixed(2) : 3.1;
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S + ' ' + S + '" width="' + S * 10 + '" height="' + S * 10 + '">' +
        '<defs><path id="arcTop" d="M' + (c0 - rTop) + ' ' + c0 + ' A' + rTop + ' ' + rTop + ' 0 0 1 ' + (c0 + rTop) + ' ' + c0 + '"/>' +
        '<path id="arcBot" d="M' + (c0 - rBot) + ' ' + c0 + ' A' + rBot + ' ' + rBot + ' 0 0 0 ' + (c0 + rBot) + ' ' + c0 + '"/></defs>' +
        '<circle cx="' + c0 + '" cy="' + c0 + '" r="' + R + '" fill="#fff" stroke="#000" stroke-width="0.35"/>' +
        '<path fill="#000" shape-rendering="crispEdges" d="' + d + '"/>' +
        (l1 ? '<text font-family="' + font + '" font-weight="700" font-size="' + s1 + '" fill="#000" text-anchor="middle">' +
          '<textPath href="#arcTop" startOffset="50%">' + esc(l1) + '</textPath></text>' : '') +
        (l2 ? '<text font-family="' + font + '" font-size="' + s2 + '" fill="#000" text-anchor="middle">' +
          '<textPath href="#arcBot" startOffset="50%">' + esc(l2) + '</textPath></text>' : '') +
        '</svg>';
    }
    codes.push({
      key: 'RoundLabel', title: 'Round mount QR', label: true, build: build,
      line1: mountId, line2: puck ? puck.line2 : '', names: ['Around the top', 'Around the bottom'],
      svg: build(mountId, puck ? puck.line2 : ''),
      info: [
        'Standard QR, version ' + (n - 17) / 4 + ' (' + n + '×' + n + ' squares), with text around it',
        'Round, for the back or top face of a puck mount; the outer ring is a cutting guide',
        'At ' + MM + ' mm per square: ' + (S * MM).toFixed(1) + ' mm across. Scale it to fit; the QR stays readable down to about 0.25 mm per square.',
        'No standard circular QR code exists that phones can read, so the code itself stays square'
      ]
    });
  })();

  // 4. Rounded QR
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
          'A shorter address in capitals (qr_base in _config.yml) would fit.'
        ]
      });
    }
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

  // Wide codes go last so they don't break up the grid
  return codes.filter(function (c) { return !c.wide && !c.label; })
    .concat(codes.filter(function (c) { return !c.wide && c.label; }))
    .concat(codes.filter(function (c) { return c.wide; }));
  }

  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  // PNG at 20 pixels per square
  function toPng(svg, cb) {
    var vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    var img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = Math.round(vb[1] * 20); cv.height = Math.round(vb[2] * 20);
      var ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob(cb, 'image/png');
    };
    img.src = url;
  }
  window.MountCodes = { make: make, toPng: toPng, save: save };

  // ---------- mount page ----------
  var section = document.getElementById('codes');
  if (!section) return;
  var mountId = section.dataset.id;
  var codes = make({ text: section.dataset.text, id: mountId, year: section.dataset.year,
    minerals: section.dataset.minerals, affiliation: section.dataset.affiliation, nsamples: section.dataset.nsamples });
  var grid = section.querySelector('.codes');
  grid.innerHTML = codes.map(function (c, i) {
    return '<figure class="code' + (c.wide ? ' wide' : '') + (c.label ? ' label' : '') + '" data-i="' + i + '">' +
      (c.empty
        ? '<div class="code-img code-empty"><span>' + esc(c.empty) + '</span></div>'
        : '<div class="code-img">' + c.svg + '</div>') +
      '<figcaption><strong>' + esc(c.title) + '</strong>' +
      '<ul>' + c.info.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      (c.label ? '<div class="label-edit">' +
        '<label>' + (c.names ? c.names[0] : 'Top line') + ' <input class="mono" data-line="1" value="' + esc(c.line1) + '"></label>' +
        '<label>' + (c.names ? c.names[1] : 'Second line') + ' <input data-line="2" value="' + esc(c.line2) + '"></label>' +
        '<button type="button" class="link-btn small" data-reset="' + i + '">Reset to the standard text</button>' +
        '<small class="muted">Edits change the preview and downloads only; they aren\'t saved to the mount.</small></div>' : '') +
      (c.empty ? '' :
        '<div class="code-dl"><button type="button" class="btn small" data-i="' + i + '" data-fmt="svg">SVG</button>' +
        '<button type="button" class="btn small" data-i="' + i + '" data-fmt="png">PNG</button></div>') +
      '</figcaption></figure>';
  }).join('');

  // Small standard code in the side card
  var side = document.getElementById('qr');
  if (side) side.innerHTML = codes[0].svg;

  function download(c, fmt) {
    var name = mountId + '_' + c.key;
    if (fmt === 'svg') return save(new Blob([c.svg], { type: 'image/svg+xml' }), name + '.svg');
    toPng(c.svg, function (b) { save(b, name + '.png'); });
  }
  // Puck label: live editing of the two text lines
  grid.addEventListener('input', function (e) {
    var fig = e.target.closest('.code.label');
    if (!fig || !e.target.dataset.line) return;
    relabel(fig);
  });
  function relabel(fig) {
    var c = codes[+fig.dataset.i];
    var l1 = fig.querySelector('[data-line="1"]').value, l2 = fig.querySelector('[data-line="2"]').value;
    c.svg = c.build(l1, l2);
    fig.querySelector('.code-img').innerHTML = c.svg;
  }
  grid.addEventListener('click', function (e) {
    var rs = e.target.closest('[data-reset]');
    if (rs) {
      var c = codes[+rs.dataset.reset], fig = rs.closest('.code');
      fig.querySelector('[data-line="1"]').value = c.line1;
      fig.querySelector('[data-line="2"]').value = c.line2;
      relabel(fig);
      return;
    }
    var b = e.target.closest('button[data-fmt]');
    if (b) download(codes[+b.dataset.i], b.dataset.fmt);
  });
  var sideBtn = document.getElementById('qr-download');
  if (sideBtn) sideBtn.addEventListener('click', function () { download(codes[0], 'svg'); });
})();
