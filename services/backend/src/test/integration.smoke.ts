/**
 * Integration smoke test — ingest → stats.
 *
 * Spins against a real PostgreSQL (env DATABASE_URL). In CI this is the
 * postgres service container. Locally it's broilerlab_ng on :5433.
 *
 * Run: npx tsx src/test/integration.smoke.ts
 */

const BASE = process.env.API_BASE || 'http://127.0.0.1:3001/api/v1';

async function main() {
  // 1) Login (researcher@lab.local / broilerlab123 seeded by auth.service)
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'researcher@lab.local', password: 'broilerlab123' }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const { access_token } = await login.json();
  const H = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

  // 2) Create cycle (unique code to avoid 409 on re-runs)
  const code = 'ITEST-' + Date.now().toString().slice(-6);
  const cycleRes = await fetch(`${BASE}/cycles`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ cycle_code: code, label: 'Integration', strain: 'ross308', bird_count: 10, pen_id: 'P01' }),
  });
  if (!cycleRes.ok) throw new Error(`create cycle failed: ${cycleRes.status}`);
  const cycle = await cycleRes.json();
  console.log('created cycle', cycle.id);

  // 3) Ingest (unique uids to avoid ON CONFLICT DO NOTHING dedup)
  const u1 = 'it-' + Date.now() + '-1';
  const u2 = 'it-' + Date.now() + '-2';
  const ing = await fetch(`${BASE}/cycles/${cycle.id}/ingest`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      device_id: 'F01',
      flock_id: 'S1',
      events: [
        { uid: u1, ts: new Date().toISOString(), bird_id: 'B001', age_day: 30, weight_g: 1498, feed_delta_g: -45, temp_c: 24, humidity: 60, rssi: -55, read_ok: true },
        { uid: u2, ts: new Date().toISOString(), bird_id: 'B001', age_day: 30, weight_g: 1505, feed_delta_g: -12, temp_c: 24, humidity: 61, rssi: -57, read_ok: true },
      ],
    }),
  }).then((r) => r.json());
  console.log('ingest result', ing);

  // 4) Stats
  const stats = await fetch(`${BASE}/cycles/${cycle.id}/stats`, { headers: H }).then((r) => r.json());
  console.log('stats', stats);

  if (stats.device_rows < 2) throw new Error('expected >=2 device rows');
  if (stats.visits < 1) throw new Error('expected >=1 visit');

  // 5) Anti-IDOR: another user cannot read
  const login2 = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@lab.local', password: 'broilerlab123' }),
  });
  if (login2.ok) {
    const { access_token: t2 } = await login2.json();
    const cross = await fetch(`${BASE}/cycles/${cycle.id}/stats`, {
      headers: { Authorization: `Bearer ${t2}` },
    });
    if (cross.ok) throw new Error('Anti-IDOR FAILED: cross-user read succeeded');
    console.log('Anti-IDOR OK: cross-user got', cross.status);
  } else {
    console.log('admin user not seeded; skipping IDOR cross-check');
  }

  console.log('\nINTEGRATION SMOKE PASSED');
}

main().catch((e) => {
  console.error('INTEGRATION SMOKE FAILED:', e.message);
  process.exit(1);
});
