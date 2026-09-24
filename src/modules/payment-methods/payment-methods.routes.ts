import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { parseWith } from '../../common/http/validate.js';
import { authOf } from '../../common/middleware/require-auth.js';
import { hmac, publicId } from '../../common/security/tokens.js';
import { personNameSchema } from '../users/user.schemas.js';
import { MAX_PAYMENT_METHODS, PaymentMethodModel, type PaymentMethodDocument } from './payment-method.model.js';

/** Sandbox lookup for the bank-code prefix of common IFSCs; unknown codes require a bank name. */
export const IFSC_BANKS: Record<string, string> = {
  SBIN: 'State Bank of India',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  UTIB: 'Axis Bank',
  KKBK: 'Kotak Mahindra Bank',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  UBIN: 'Union Bank of India',
  IDIB: 'Indian Bank',
  YESB: 'Yes Bank',
  INDB: 'IndusInd Bank',
  IDFB: 'IDFC FIRST Bank',
  FDRL: 'Federal Bank',
};

const labelSchema = z.string().trim().max(40).optional().transform((value) => value || null);

const bankAccountSchema = z
  .object({
    accountHolderName: personNameSchema.pipe(z.string().max(80)),
    accountNumber: z.string().trim().regex(/^\d{9,18}$/, 'must be 9 to 18 digits'),
    ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'must be a valid IFSC (e.g. HDFC0001234)'),
    accountType: z.enum(['SAVINGS', 'CURRENT']).default('SAVINGS'),
    bankName: z.string().trim().min(2).max(60).optional(),
    label: labelSchema,
  })
  .strict();

const upiSchema = z
  .object({
    vpa: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,31}$/, 'must look like name@bank'),
    label: labelSchema,
  })
  .strict();

const methodIdSchema = z.string().regex(/^pm_[a-f0-9]{20}$/);

export function toPaymentMethodDto(method: PaymentMethodDocument) {
  return {
    id: method.publicId,
    type: method.type,
    label: method.label ?? null,
    isDefault: method.isDefault,
    verifiedAt: method.verifiedAt.toISOString(),
    createdAt: method.createdAt.toISOString(),
    bank: method.bank
      ? {
          bankName: method.bank.bankName,
          accountHolderName: method.bank.accountHolderName,
          accountLast4: method.bank.accountLast4,
          maskedAccountNumber: `•••• ${method.bank.accountLast4}`,
          ifsc: method.bank.ifsc,
          accountType: method.bank.accountType,
        }
      : null,
    upi: method.upi ? { vpa: method.upi.vpa } : null,
  };
}

export function createPaymentMethodsRouter({ requireAuth, fingerprintSecret }: { requireAuth: RequestHandler; fingerprintSecret: string }): Router {
  const router = Router();
  router.use(requireAuth);

  async function list(userId: string) {
    const methods = await PaymentMethodModel.find({ userId }).sort({ createdAt: 1 }).lean<PaymentMethodDocument[]>();
    return methods.map(toPaymentMethodDto);
  }

  async function add(userId: string, method: Omit<PaymentMethodDocument, 'publicId' | 'userId' | 'isDefault' | 'verifiedAt' | 'createdAt' | 'updatedAt'>) {
    const count = await PaymentMethodModel.countDocuments({ userId });
    if (count >= MAX_PAYMENT_METHODS) throw new AppError('PAYMENT_METHOD_LIMIT_REACHED');
    try {
      const created = await PaymentMethodModel.create({
        ...method,
        publicId: publicId('pm'),
        userId,
        isDefault: count === 0,
        // Sandbox: linking is instant. A real integration would verify via penny-drop / VPA lookup.
        verifiedAt: new Date(),
      });
      return toPaymentMethodDto(created.toObject());
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new AppError('PAYMENT_METHOD_DUPLICATE');
      throw err;
    }
  }

  router.get('/', async (req, res) => {
    res.json({ data: await list(authOf(req).userId) });
  });

  router.post('/bank-accounts', async (req, res) => {
    const { userId } = authOf(req);
    const input = parseWith(bankAccountSchema, req.body);
    const bankName = input.bankName ?? IFSC_BANKS[input.ifsc.slice(0, 4)];
    if (!bankName) throw new AppError('VALIDATION_FAILED', { details: [{ path: 'bankName', message: 'is required for this IFSC' }] });
    const dto = await add(userId, {
      type: 'BANK_ACCOUNT',
      uniqueKey: `bank:${hmac(fingerprintSecret, 'bank-account', `${input.ifsc.slice(0, 4)}:${input.accountNumber}`)}`,
      label: input.label,
      bank: {
        bankName,
        accountHolderName: input.accountHolderName,
        accountLast4: input.accountNumber.slice(-4),
        ifsc: input.ifsc,
        accountType: input.accountType,
      },
      upi: null,
    });
    res.status(201).json({ data: dto });
  });

  router.post('/upi-ids', async (req, res) => {
    const { userId } = authOf(req);
    const input = parseWith(upiSchema, req.body);
    const dto = await add(userId, { type: 'UPI_ID', uniqueKey: `upi:${input.vpa}`, label: input.label, bank: null, upi: { vpa: input.vpa } });
    res.status(201).json({ data: dto });
  });

  router.post('/:methodId/default', async (req, res) => {
    const { userId } = authOf(req);
    const id = methodIdSchema.safeParse(req.params.methodId);
    if (!id.success || !(await PaymentMethodModel.exists({ userId, publicId: id.data }))) throw new AppError('RESOURCE_NOT_FOUND');
    await PaymentMethodModel.updateMany({ userId }, [{ $set: { isDefault: { $eq: ['$publicId', id.data] } } }], { updatePipeline: true });
    res.json({ data: await list(userId) });
  });

  router.delete('/:methodId', async (req, res) => {
    const { userId } = authOf(req);
    const id = methodIdSchema.safeParse(req.params.methodId);
    if (!id.success) throw new AppError('RESOURCE_NOT_FOUND');
    const removed = await PaymentMethodModel.findOneAndDelete({ userId, publicId: id.data }).lean<PaymentMethodDocument>();
    if (!removed) throw new AppError('RESOURCE_NOT_FOUND');
    if (removed.isDefault) {
      await PaymentMethodModel.findOneAndUpdate({ userId }, { $set: { isDefault: true } }, { sort: { createdAt: 1 } });
    }
    res.json({ data: await list(userId) });
  });

  return router;
}

export function createWalletsRouter({ requireAuth }: { requireAuth: RequestHandler }): Router {
  const router = Router();
  router.use(requireAuth);
  router.get('/me', async (req, res) => {
    const { userId } = authOf(req);
    const methods = await PaymentMethodModel.find({ userId }).lean<PaymentMethodDocument[]>();
    res.json({
      data: {
        currency: 'INR',
        // The double-entry ledger (BE-010) will own balances; until then every wallet starts empty.
        balanceMinor: 0,
        ledgerAvailable: false,
        sandbox: true,
        linked: {
          bankAccounts: methods.filter((method) => method.type === 'BANK_ACCOUNT').length,
          upiIds: methods.filter((method) => method.type === 'UPI_ID').length,
        },
        defaultMethodId: methods.find((method) => method.isDefault)?.publicId ?? null,
      },
    });
  });
  return router;
}
