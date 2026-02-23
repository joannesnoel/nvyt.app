export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const vapidKey = config.public.vapidPublicKey

  setResponseHeader(event, 'content-type', 'text/html')

  return `<!DOCTYPE html>
<html>
<head><title>Push Diagnostic</title></head>
<body>
<h2>Push Notification Diagnostic</h2>
<pre id="log"></pre>
<button onclick="runTest()">Run Push Test</button>
<script>
const VAPID_KEY = '${vapidKey}';
const log = document.getElementById('log');
function L(msg) { log.textContent += msg + '\\n'; console.log(msg); }

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function runTest() {
  log.textContent = '';
  L('VAPID public key: ' + VAPID_KEY);
  L('VAPID key length: ' + VAPID_KEY.length);
  L('serviceWorker in navigator: ' + ('serviceWorker' in navigator));
  L('PushManager in window: ' + ('PushManager' in window));
  L('Notification in window: ' + ('Notification' in window));
  L('Notification.permission: ' + Notification.permission);
  L('');

  try {
    L('Step 1: Requesting notification permission...');
    const perm = await Notification.requestPermission();
    L('  Permission result: ' + perm);
    if (perm !== 'granted') { L('STOPPED: Permission not granted'); return; }
  } catch (e) { L('  ERROR: ' + e); return; }

  let registration;
  try {
    L('');
    L('Step 2: Getting SW registrations...');
    const regs = await navigator.serviceWorker.getRegistrations();
    L('  Found ' + regs.length + ' registration(s)');
    regs.forEach((r, i) => {
      L('  [' + i + '] scope: ' + r.scope);
      L('      active: ' + (r.active ? r.active.state : 'null'));
      L('      waiting: ' + (r.waiting ? r.waiting.state : 'null'));
      L('      installing: ' + (r.installing ? r.installing.state : 'null'));
    });
  } catch (e) { L('  ERROR: ' + e); }

  try {
    L('');
    L('Step 3: Waiting for navigator.serviceWorker.ready...');
    registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 10s')), 10000)),
    ]);
    L('  Ready! scope: ' + registration.scope);
    L('  active SW state: ' + (registration.active ? registration.active.state : 'null'));
    L('  pushManager: ' + (registration.pushManager ? 'exists' : 'null'));
  } catch (e) { L('  ERROR: ' + e); return; }

  try {
    L('');
    L('Step 4: Checking existing push subscription...');
    const existingSub = await registration.pushManager.getSubscription();
    L('  Existing subscription: ' + (existingSub ? 'YES' : 'null'));
    if (existingSub) {
      L('  Endpoint: ' + existingSub.endpoint.substring(0, 80) + '...');
      L('  Unsubscribing old subscription...');
      await existingSub.unsubscribe();
      L('  Unsubscribed.');
    }
  } catch (e) { L('  ERROR checking/clearing subscription: ' + e); }

  try {
    L('');
    L('Step 5: Calling pushManager.subscribe()...');
    const keyArray = urlBase64ToUint8Array(VAPID_KEY);
    L('  applicationServerKey bytes: ' + keyArray.length + ', first byte: 0x' + keyArray[0].toString(16));
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyArray,
    });
    L('  SUCCESS!');
    L('  Endpoint: ' + sub.endpoint);
    const json = sub.toJSON();
    L('  p256dh: ' + (json.keys?.p256dh ? 'present' : 'missing'));
    L('  auth: ' + (json.keys?.auth ? 'present' : 'missing'));
  } catch (e) {
    L('  FAILED: ' + e.name + ': ' + e.message);
    L('');
    L('Troubleshooting:');
    L('- Try: chrome://settings/content/notifications (check if site is blocked)');
    L('- Try: chrome://flags/#enable-push-api (check if enabled)');
    L('- Try opening chrome://gcm-internals/ in another tab');
    L('- Try a different browser or incognito window');
  }
}
</script>
</body>
</html>`
})
