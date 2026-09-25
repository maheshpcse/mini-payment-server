import { publicId } from '../common/security/tokens.js';
import type { Migration } from '../infrastructure/database/mongodb/migrations/runner.js';
import { bankAccountKey, upiKey } from '../modules/payment-methods/payment-method.model.js';
import { IFSC_BANKS } from '../modules/reference-data/data/masters.js';
import { DEMO_PASSWORD, demoAccountsFor } from '../modules/reference-data/data/demo-accounts.js';
import { DEFAULT_PREFERENCES } from '../modules/users/user.model.js';

/**
 * Demo logins (credentials in docs/MASTER_DATA.md). Consumer demo accounts are
 * created everywhere; staff demo accounts only outside staging/production.
 * Existing users are never modified, so an address someone already registered
 * is left alone.
 */
export const demoAccounts: Migration = {
  version: 3,
  name: 'demo-accounts',
  async up(db, { appEnv, fingerprintSecret, hasher }) {
    const users = db.collection('users');
    const methods = db.collection('payment_methods');
    const now = new Date();

    for (const account of demoAccountsFor(appEnv)) {
      let user = await users.findOne<{ publicId: string; isDemo?: boolean }>({ email: account.email });
      if (!user) {
        const phoneTaken = account.phone !== null && (await users.countDocuments({ phone: account.phone })) > 0;
        const created = {
          publicId: publicId('usr'),
          email: account.email,
          phone: phoneTaken ? null : account.phone,
          firstName: account.firstName,
          lastName: account.lastName,
          passwordHash: await hasher.hash(DEMO_PASSWORD),
          passwordChangedAt: null,
          roles: account.roles,
          status: 'ACTIVE',
          avatar: null,
          preferences: structuredClone(DEFAULT_PREFERENCES),
          isDemo: true,
          createdAt: now,
          updatedAt: now,
        };
        await users.insertOne(created);
        user = created;
      }
      if (!user.isDemo) continue;

      for (const [index, method] of account.paymentMethods.entries()) {
        const bank = method.bank;
        const uniqueKey = bank ? bankAccountKey(fingerprintSecret, bank.ifsc, bank.accountNumber) : upiKey(method.vpa!);
        await methods.updateOne(
          { userId: user.publicId, uniqueKey },
          {
            $setOnInsert: {
              publicId: publicId('pm'),
              userId: user.publicId,
              type: method.type,
              uniqueKey,
              label: method.label,
              bank: bank
                ? {
                    bankName: IFSC_BANKS[bank.ifsc.slice(0, 4)]!,
                    accountHolderName: `${account.firstName} ${account.lastName}`,
                    accountLast4: bank.accountNumber.slice(-4),
                    ifsc: bank.ifsc,
                    accountType: bank.accountType,
                  }
                : null,
              upi: method.vpa ? { vpa: method.vpa } : null,
              isDefault: index === 0,
              verifiedAt: now,
              createdAt: now,
              updatedAt: now,
            },
          },
          { upsert: true },
        );
      }
    }
  },
};
