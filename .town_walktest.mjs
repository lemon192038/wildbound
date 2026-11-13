import { bakeLayout, bakeTerrain, SPOTS } from './src/town/layout.js';
import { Bucket } from './src/town/kit.js';
import { buildCity } from './src/town/build.js';
let t0 = performance.now();
const L0 = bakeLayout(); const terrainY = bakeTerrain();
console.log('bake', (performance.now() - t0).toFixed(0), 'ms');
const B = {}; for (const k of ['stone','cobble','wood','roof','plaster','metal','leaf','glass','glow']) B[k] = new Bucket(k); B.cloth = new Bucket('cloth', { wave: true });
t0 = performance.now(); buildCity(B, { low: false, getHeight: L0.getHeight, terrainY }); console.log('build', (performance.now() - t0).toFixed(0), 'ms');
let tris = 0; for (const k of Object.keys(B)) if (B[k] instanceof Bucket) { console.log(k, B[k].count / 3); tris += B[k].count / 3; } console.log('tris', tris, 'fillers', B.fillerCount, 'emit', B.emit.length, 'inst', Object.fromEntries(Object.entries(B.inst).map(([k,v])=>[k,v.length])));
t0 = performance.now(); const L = L0.finalize(); console.log('mask', (performance.now() - t0).toFixed(0), 'ms', 'colliders', L.colliders.length);
// BFS on mask from spawn
const { mask, MN, MX0 } = L; const idx = (x, z) => Math.floor(z - MX0) * MN + Math.floor(x - MX0);
const dist = new Int32Array(MN * MN).fill(-1); const q = [idx(0, -9)]; dist[q[0]] = 0;
while (q.length) { const k = q.shift(); const i = k % MN, j = (k / MN) | 0; for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= MN || jj >= MN) continue; const kk = jj * MN + ii; if (mask[kk] && dist[kk] < 0) { dist[kk] = dist[k] + 1; q.push(kk); } } }
for (const [id, s] of Object.entries(SPOTS)) console.log(id, 'walkable', L.walkable(s.talk[0], s.talk[1]), 'reach steps', dist[idx(s.talk[0], s.talk[1])], 'h', L.getHeight(s.talk[0], s.talk[1]).toFixed(2));
let reach = 0, total = 0; for (let k = 0; k < MN * MN; k++) if (mask[k]) { total++; if (dist[k] >= 0) reach++; } console.log('walk cells', total, 'reachable', reach);
// list unreachable clusters centers
const seen = new Uint8Array(MN*MN); for (let k = 0; k < MN*MN; k++) if (mask[k] && dist[k] < 0 && !seen[k]) { let n=0,sx=0,sz=0; const st=[k]; seen[k]=1; while(st.length){const c=st.pop(); n++; sx+=c%MN; sz+=(c/MN)|0; const i=c%MN,j=(c/MN)|0; for (const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {const kk=(j+dj)*MN+i+di; if(mask[kk]&&!seen[kk]&&dist[kk]<0){seen[kk]=1;st.push(kk);}}} if (n>3) console.log('island', n, (sx/n+MX0).toFixed(0), (sz/n+MX0).toFixed(0)); }
