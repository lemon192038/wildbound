// Uniform-grid spatial hash on the XZ plane. Rebuild per tick (clear + insert) for moving things, or once for
// static ones. query() never allocates when given an `out` array.
//   const h = new SpatialHash(16); h.insert(obj, x, z); h.query(x, z, r, out) → objects whose cell overlaps the circle
export class SpatialHash {
  constructor(cell = 16) { this.cell = cell; this.map = new Map(); this.pool = []; }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  clear() { for (const a of this.map.values()) { a.length = 0; this.pool.push(a); } this.map.clear(); }
  insert(obj, x, z) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let a = this.map.get(k); if (!a) { a = this.pool.pop() || []; this.map.set(k, a); } a.push(obj);
  }
  query(x, z, r, out = []) {
    out.length = 0; const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const a = this.map.get(this.key(ix, iz)); if (a) for (const o of a) out.push(o); }
    return out;
  }
}
