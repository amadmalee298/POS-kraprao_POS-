import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

async function main() {
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  const app = initializeApp(config);
  const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);

  console.log('=== BRANCH branch-1786349847821 SUB-COLLECTIONS ===');
  const branchInvSnap = await getDocs(collection(db, 'branches', 'branch-1786349847821', 'inventory'));
  console.log('branch inventory size:', branchInvSnap.size);
  branchInvSnap.forEach(d => {
    console.log('ING:', d.id, JSON.stringify(d.data()));
  });

  console.log('=== ORDERS FULL DETAILS ===');
  const ordSnap = await getDocs(collection(db, 'orders'));
  console.log('orders count:', ordSnap.size);
  ordSnap.forEach(d => {
    const o = d.data();
    console.log(`ORDER ${d.id}: branch=${o.branchId}, total=${o.grandTotal}, itemsCount=${o.items?.length}`);
    if (o.items && o.items.length > 0) {
      o.items.forEach((it: any) => {
        console.log('  ITEM:', JSON.stringify(it));
      });
    }
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
