const { VectorTile } = require('@mapbox/vector-tile');
const Protobuf = require('pbf').default;
const fs = require('fs');

const file = process.argv[2] || 'tile.pbf';
// fs.readFileSync often returns a Buffer with a non-zero byteOffset into
// Node's shared pool. pbf@4's DataView reads ignore that offset (a bug in
// pbf, not in our tile data) — copy into a zero-offset Uint8Array first.
const raw = fs.readFileSync(file);
const bytes = new Uint8Array(raw);
const tile = new VectorTile(new Protobuf(bytes));
console.log('layers:', Object.keys(tile.layers));
const layer = tile.layers.plots;
if (!layer) {
  console.error('NO plots LAYER');
  process.exit(1);
}
console.log('features:', layer.length);
for (let i = 0; i < Math.min(3, layer.length); i++) {
  const f = layer.feature(i);
  console.log('  #' + i, 'type:', f.type, 'props:', f.properties);
}
