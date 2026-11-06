// Minimal zip writer (no compression). makeZip([{name, data: Uint8Array}]) -> Blob
(function () {
  var table = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  function crc32(b) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function header(size) { var b = new Uint8Array(size); return { b: b, v: new DataView(b.buffer) }; }

  window.makeZip = function (files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data);
      var h = header(30), v = h.v;
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
      v.setUint16(10, time, true); v.setUint16(12, date, true);
      v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true);
      parts.push(h.b, name, data);

      var c = header(46), w = c.v;
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true);
      w.setUint16(12, time, true); w.setUint16(14, date, true);
      w.setUint32(16, crc, true); w.setUint32(20, data.length, true); w.setUint32(24, data.length, true);
      w.setUint16(28, name.length, true); w.setUint32(42, offset, true);
      central.push(c.b, name);
      offset += 30 + name.length + data.length;
    });
    var size = central.reduce(function (s, b) { return s + b.length; }, 0);
    var e = header(22), x = e.v;
    x.setUint32(0, 0x06054b50, true); x.setUint16(8, files.length, true); x.setUint16(10, files.length, true);
    x.setUint32(12, size, true); x.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [e.b]), { type: 'application/zip' });
  };
})();
