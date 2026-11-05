// Mount page: map of where the EarthBank-linked samples were collected.
(function () {
  var el = document.getElementById('eb-map');
  if (!el || !window.L) return;
  var pts = JSON.parse(el.dataset.points || '[]');
  var map = L.map(el, { scrollWheelZoom: false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18, subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(map);
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var bounds = [];
  pts.forEach(function (p) {
    bounds.push([p.lat, p.lon]);
    L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#2f81f7', fillOpacity: 1 })
      .addTo(map)
      .bindPopup('<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><strong>' + esc(p.name) + '</strong></a>' +
        (p.place ? '<br>' + esc(p.place) : '') + '<br>' + p.lat + ', ' + p.lon);
  });
  if (bounds.length === 1) map.setView(bounds[0], 9);
  else map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
})();
