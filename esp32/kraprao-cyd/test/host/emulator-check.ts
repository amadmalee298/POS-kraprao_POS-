/**
 * End-to-end check of the terminal's Firestore documents against the shop's real firestore.rules,
 * using the Firebase emulators (no real project is touched: the project id starts with "demo-").
 *
 *   1. a staff device publishes public_menu/{branch} with the web app's buildPublicMenu()
 *   2. the "terminal" signs in anonymously over REST, downloads the menu, and the C++ parser
 *      (menu-test parse) must read every dish, price, option and sold-out flag
 *   3. the C++ order body (menu-test order) is POSTed exactly like the ESP32 does: accepted by the
 *      rules, totals match calculateOrderTotals(), and the status can be followed
 *   4. the rules still refuse an order that skips approval, and a resend gives 409 (= already sent)
 *
 * Run from the repository root: see esp32/kraprao-cyd/test/host/run.sh
 */
import { execFileSync } from 'child_process';
import { copyFileSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { buildPublicMenu } from '../../../../src/utils/publicMenu';
import { DEFAULT_CATEGORIES, INITIAL_MENU_ITEMS, INITIAL_SETTINGS, STANDARD_ADD_ONS } from '../../../../src/data/initialData';
import { calculateOrderTotals } from '../../../../src/utils/tax';

const PROJECT = 'demo-kraprao';
const BRANCH = 'branch-test';
const STAFF = 'staff@example.com';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const TOOL = process.env.MENU_TEST || '/tmp/hosttest/menu-test';

let failures = 0;
function check(cond: unknown, what: string) {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) failures++;
}

async function main() {
  // Staff list (the first entry is made in the console in production; here as the emulator owner)
  await fetch(`${FS}/access/staff`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { emails: { arrayValue: { values: [{ stringValue: STAFF }] } } } })
  });

  // 1. Staff device publishes the customer menu
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  await createUserWithEmailAndPassword(auth, STAFF, 'secret123');

  const items = INITIAL_MENU_ITEMS.map((m, i) => ({ ...m, isSoldOut: i === 1 ? true : m.isSoldOut }));
  const settings = { ...INITIAL_SETTINGS, enableVat: true, vatRate: 7, vatType: 'exclusive' as const };
  const published = buildPublicMenu(items, DEFAULT_CATEGORIES, STANDARD_ADD_ONS, settings,
    { id: BRANCH, name: 'สาขาทดสอบ', promptpayMobileOrTaxId: '0891234567' }, '0891234567');
  await setDoc(doc(db, 'public_menu', BRANCH), published);

  // 2. Terminal: anonymous sign-in + menu download over REST, as cloud.cpp does
  const signUp = await fetch(`${AUTH}/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  }).then(r => r.json());
  const token = signUp.idToken as string;
  check(!!token && !!signUp.refreshToken, 'anonymous sign-in returns idToken + refreshToken');

  const menuRes = await fetch(`${FS}/public_menu/${BRANCH}`, { headers: { Authorization: `Bearer ${token}` } });
  check(menuRes.status === 200, `terminal can read public_menu (${menuRes.status})`);
  const dir = mkdtempSync(join(tmpdir(), 'cyd-'));
  const menuFile = join(dir, 'menu.json');
  writeFileSync(menuFile, await menuRes.text());
  // The UI simulator (test/sim) draws its screenshots from this menu
  if (process.env.MENU_SNAPSHOT) copyFileSync(menuFile, process.env.MENU_SNAPSHOT);

  const parsed = JSON.parse(execFileSync(TOOL, ['parse', menuFile]).toString());
  check(parsed.branchName === 'สาขาทดสอบ', 'branch name');
  check(parsed.promptPayId === '0891234567', 'PromptPay id');
  check(parsed.vatType === 'exclusive' && parsed.vatRate === 7 && parsed.vatEnabled === true, 'VAT settings');
  check(parsed.items.length === published.menuItems.length, `all ${published.menuItems.length} dishes read`);
  check(parsed.addOns.length === published.addOns.length, 'all toppings read');
  check(parsed.categories.length === published.categories.length, 'all categories read');
  let itemsOk = true;
  for (const p of published.menuItems) {
    const got = parsed.items.find((x: any) => x.id === p.id);
    const same =
      got &&
      got.name === p.name &&
      got.category === p.category &&
      Math.abs(got.price - p.price) < 0.001 &&
      got.soldOut === !!p.isSoldOut &&
      got.popular === !!p.isPopular &&
      JSON.stringify(got.spiceLevels) === JSON.stringify(p.availableSpiceLevels || []) &&
      JSON.stringify(got.proteins.map((x: any) => [x.name, x.extraPrice])) ===
        JSON.stringify((p.availableProteins || []).map(x => [x.name, x.extraPrice]));
    if (!same) {
      itemsOk = false;
      console.log('  mismatch', p.id, JSON.stringify(got));
    }
  }
  check(itemsOk, 'every dish: name, category, price, sold out, popular, spice levels, proteins');
  check(parsed.items.some((x: any) => x.soldOut), 'sold-out flag survives');

  // 3. Order exactly as the terminal sends it
  const orderId = `ord-${Date.now()}-abcdef`;
  const now = new Date().toISOString();
  const body = execFileSync(TOOL, ['order', menuFile, orderId, now]).toString();
  const post = (id: string, b: string) =>
    fetch(`${FS}/orders?documentId=${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: b
    });
  const created = await post(orderId, body);
  check(created.status === 200, `firestore.rules accept the terminal's order (${created.status} ${created.status === 200 ? '' : await created.text()})`);

  const saved = (await getDoc(doc(db, 'orders', orderId))).data()!;
  check(saved.status === 'pending-qr' && saved.isQrOrder === true && saved.orderSource === 'qr', 'arrives as a QR order waiting for approval');
  check(saved.paymentStatus === 'unpaid' && saved.tenderedAmount === 0, 'unpaid, nothing tendered');
  check(saved.tableNumber === '5' && saved.orderType === 'dine-in' && saved.branchId === 'branch-1786349847821', 'table / type / branch from config');
  check(saved.createdAt === now, 'createdAt is the ISO time (the POS sorts by it)');

  // Recompute the cart independently from the published menu
  const dish = published.menuItems.find(m => !m.isSoldOut && (m.availableProteins || []).length > 0)!;
  const protein = dish.availableProteins!.at(-1)!;
  const topping =
    dish.allowAddOns === false
      ? undefined
      : published.addOns.find(a => !dish.allowedAddOnIds?.length || dish.allowedAddOnIds.includes(a.id));
  const unit1 = dish.price + protein.extraPrice + (topping?.price || 0);
  const other = published.menuItems.find(m => !m.isSoldOut && m.id !== dish.id)!;
  const subtotal = unit1 * 2 + other.price;
  const totals = calculateOrderTotals(subtotal, 0, settings);

  const [l1, l2] = saved.items;
  check(saved.items.length === 2 && saved.itemsCount === 3, '2 lines, 3 dishes');
  check(l1.menuItemId === dish.id && l1.name === dish.name && l1.quantity === 2 && l1.unitPrice === unit1 && l1.totalPrice === unit1 * 2,
    `line 1: ${dish.name} x2 @ ${unit1}`);
  check(l1.proteinChoice === protein.name && l1.spiceLevel === (dish.availableSpiceLevels?.[0] ?? null), 'line 1 protein + spice');
  check(JSON.stringify(l1.selectedAddOns) === JSON.stringify(topping ? [topping.name] : []), 'line 1 topping names');
  check(l2.menuItemId === other.id && l2.quantity === 1 && l2.proteinChoice === null, `line 2: ${other.name}`);
  check(saved.subtotal === totals.netSubtotal && saved.vatAmount === totals.vatAmount && saved.grandTotal === totals.grandTotal,
    `totals match calculateOrderTotals: ${saved.subtotal} + VAT ${saved.vatAmount} = ${saved.grandTotal}`);

  // Status polling as the terminal does it
  const status = await fetch(`${FS}/orders/${orderId}?mask.fieldPaths=status`, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.json());
  check(status.fields?.status?.stringValue === 'pending-qr', 'terminal can follow the order status');

  // 4. Resend and rule enforcement
  check((await post(orderId, body)).status === 409, 'resending the same order id gives 409 (treated as sent)');
  const skipApproval = body.replace('"stringValue":"pending-qr"', '"stringValue":"pending"');
  check((await post(`${orderId}x`, skipApproval)).status === 403, 'rules still refuse an order that skips approval');

  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
