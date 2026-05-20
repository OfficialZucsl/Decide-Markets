import { createHash } from 'crypto';
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import type { GeneratedMarket, SeedResult } from './types';

const MAX_MARKETS_PER_RUN = 5;

let adminApp: App | undefined;
let db: Firestore | undefined;

export function normalizeQuestion(question: string): string {
  return question.toLowerCase().trim().replace(/\s+/g, ' ');
}

function questionHash(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    adminApp = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
    return adminApp;
  }

  adminApp = initializeApp();
  return adminApp;
}

export function getDb(): Firestore {
  if (db) return db;

  const app = getAdminApp();
  const databaseId =
    process.env.FIRESTORE_DATABASE_ID ||
    process.env.FIREBASE_FIRESTORE_DATABASE_ID;

  db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  return db;
}

/**
 * Loads normalized questions for all open markets (pre-query dedupe).
 */
export async function getOpenQuestionKeys(): Promise<Set<string>> {
  const firestore = getDb();
  const snapshot = await firestore
    .collection('markets')
    .where('status', '==', 'open')
    .get();

  const keys = new Set<string>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.question) {
      keys.add(normalizeQuestion(String(data.question)));
    }
    if (data.decision && data.kpi) {
      keys.add(normalizeQuestion(`${data.decision}|${data.kpi}`));
    }
  });
  return keys;
}

function filterDuplicates(
  candidates: GeneratedMarket[],
  existingKeys: Set<string>
): { toCreate: GeneratedMarket[]; skippedDuplicates: number } {
  let skippedDuplicates = 0;
  const toCreate: GeneratedMarket[] = [];
  const batchKeys = new Set(existingKeys);

  for (const market of candidates) {
    const qKey = normalizeQuestion(market.question);
    const dkKey = normalizeQuestion(`${market.decision}|${market.kpi}`);

    if (batchKeys.has(qKey) || batchKeys.has(dkKey)) {
      skippedDuplicates++;
      continue;
    }

    if (toCreate.length >= MAX_MARKETS_PER_RUN) break;

    batchKeys.add(qKey);
    batchKeys.add(dkKey);
    toCreate.push(market);
  }

  return { toCreate, skippedDuplicates };
}

type DuplicateReason = 'duplicate_index' | 'duplicate_open_market';

/**
 * Transactional dedupe: market_index plus live open markets (catches admin inserts
 * between the pre-query and this write).
 */
async function findDuplicateInTransaction(
  transaction: Transaction,
  firestore: Firestore,
  market: GeneratedMarket,
  indexRef: DocumentReference
): Promise<DuplicateReason | null> {
  const indexSnap = await transaction.get(indexRef);
  if (indexSnap.exists) {
    return 'duplicate_index';
  }

  const questionQuery = firestore
    .collection('markets')
    .where('status', '==', 'open')
    .where('question', '==', market.question)
    .limit(1);
  const questionSnap = await transaction.get(questionQuery);
  if (!questionSnap.empty) {
    return 'duplicate_open_market';
  }

  const decisionKpiQuery = firestore
    .collection('markets')
    .where('status', '==', 'open')
    .where('decision', '==', market.decision)
    .where('kpi', '==', market.kpi)
    .limit(1);
  const decisionKpiSnap = await transaction.get(decisionKpiQuery);
  if (!decisionKpiSnap.empty) {
    return 'duplicate_open_market';
  }

  return null;
}

/**
 * Persists markets using Firestore transactions and market_index for atomic dedupe.
 */
export async function seedMarketsToFirestore(
  candidates: GeneratedMarket[]
): Promise<SeedResult> {
  const firestore = getDb();
  const existingKeys = await getOpenQuestionKeys();
  const { toCreate, skippedDuplicates: initialSkipped } = filterDuplicates(
    candidates,
    existingKeys
  );

  if (toCreate.length === 0) {
    return { createdCount: 0, skippedDuplicates: initialSkipped, marketIds: [] };
  }

  const marketIds: string[] = [];
  let createdCount = 0;
  let skippedDuplicates = initialSkipped;

  for (const market of toCreate) {
    const normalized = normalizeQuestion(market.question);
    const indexId = questionHash(normalized);
    const indexRef = firestore.collection('market_index').doc(indexId);
    const marketRef = firestore.collection('markets').doc();

    let duplicateReason: DuplicateReason | null = null;

    await firestore.runTransaction(async (transaction) => {
      duplicateReason = await findDuplicateInTransaction(
        transaction,
        firestore,
        market,
        indexRef
      );
      if (duplicateReason) {
        return;
      }

      const createdAt = new Date().toISOString();

      transaction.set(indexRef, {
        marketId: marketRef.id,
        question: market.question,
        createdAt,
      });

      transaction.set(marketRef, {
        decision: market.decision,
        kpi: market.kpi,
        question: market.question,
        category: market.category,
        institution: market.institution,
        yesPoints: market.yesPoints,
        noPoints: market.noPoints,
        status: market.status,
        createdAt,
        seededBy: 'cron',
      });
    });

    if (duplicateReason) {
      skippedDuplicates++;
      console.log(
        JSON.stringify({
          stage: 'firestoreSeed',
          ok: false,
          reason: duplicateReason,
          question: market.question.slice(0, 80),
        })
      );
    } else {
      marketIds.push(marketRef.id);
      createdCount++;
    }
  }

  return { createdCount, skippedDuplicates, marketIds };
}
