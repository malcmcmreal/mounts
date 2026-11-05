// Mount page: map of where the EarthBank-linked samples were collected.
(function () {
  var el = document.getElementById('eb-map');
  if (!el || !window.L) return;
  var pts = JSON.parse(el.dataset.points || '[]');
  var map = L.map(el, { scrollWheelZoom: false });
  var esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var dark = L.layerGroup([
    L.tileLayer(esri + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16,
      attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors' }),
    L.tileLayer(esri + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 })
  ]);
  var satellite = L.tileLayer(esri + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18,
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics' });
  var topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17,
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), &copy; OpenStreetMap contributors' });
  dark.addTo(map);
  L.control.layers({ 'Dark': dark, 'Satellite': satellite, 'Topographic': topo }, null, { collapsed: false }).addTo(map);
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var bounds = [];
  pts.forEach(function (p) {
    bounds.push([p.lat, p.lon]);
    L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillOpacity: 1,
      fillColor: window.MountLayout && p.sample ? MountLayout.sampleColor(p.sample) : '#f2f2f7' })
      .addTo(map)
      .bindPopup('<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><strong>' + esc(p.name) + '</strong></a>' +
        (p.place ? '<br>' + esc(p.place) : '') + (p.sample && p.sample !== p.name ? '<br>Mount sample ' + esc(p.sample) : '') + '<br>' + p.lat + ', ' + p.lon);
  });
  if (bounds.length === 1) map.setView(bounds[0], 9);
  else map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
})();
