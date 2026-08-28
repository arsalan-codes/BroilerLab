/**
 * MQTT E2E probe — publish a device batch to EMQX exactly like real firmware.
 *
 * Usage:
 *   OWNER_ID=<uuid> node scripts/mqtt-e2e.cjs            # resolves owner from env
 *   node scripts/mqtt-e2e.cjs <owner-uuid>               # or argv[2]
 *
 * Requires the backend MQTT user (see .env: MQTT_USERNAME/MQTT_PASSWORD)
 * and an active cycle owned by <owner-uuid>.
 */
const mqtt = require('mqtt');

const OWNER_ID = process.argv[2] || process.env.OWNER_ID;
if (!OWNER_ID) {
  console.error('usage: node scripts/mqtt-e2e.cjs <owner-uuid>');
  process.exit(1);
}

const client = mqtt.connect('mqtt://127.0.0.1:1883', {
  username: 'device-f01',
  password: 'device_dev',
  protocolVersion: 5,
});

client.on('connect', () => {
  const batch = {
    owner_id: OWNER_ID,
    events: [
      { uid: 'mqtt-e2e-' + Date.now() + '-1', ts: new Date().toISOString(), bird_id: 'B777', age_day: 31, weight_g: 1610, feed_delta_g: -38, temp_c: 24.5, humidity: 58, rssi: -52, read_ok: true },
      { uid: 'mqtt-e2e-' + Date.now() + '-2', ts: new Date().toISOString(), bird_id: 'B777', age_day: 31, weight_g: 1618, feed_delta_g: -12, temp_c: 24.5, humidity: 59, rssi: -53, read_ok: true },
    ],
  };
  client.publish('lab/dev/F99/events', JSON.stringify(batch), { qos: 1 }, (err) => {
    if (err) { console.error('publish failed:', err.message); process.exit(1); }
    console.log('PUBLISHED to lab/dev/F99/events');
    setTimeout(() => { client.end(true); process.exit(0); }, 1500);
  });
});

client.on('error', (e) => { console.error('MQTT error:', e.message); process.exit(1); });
