import { mongoose } from '../../infrastructure/database/mongodb/mongoose.js';

export const MAX_PAYMENT_METHODS = 10;

/**
 * Sandbox-linked funding sources. Full account numbers are never stored: only
 * the last four digits and a keyed fingerprint used to detect duplicates.
 */
export interface PaymentMethodDocument {
  publicId: string;
  userId: string;
  type: 'BANK_ACCOUNT' | 'UPI_ID';
  /** fingerprint for bank accounts, normalized VPA for UPI IDs */
  uniqueKey: string;
  label?: string | null;
  bank?: {
    bankName: string;
    accountHolderName: string;
    accountLast4: string;
    ifsc: string;
    accountType: 'SAVINGS' | 'CURRENT';
  } | null;
  upi?: { vpa: string } | null;
  isDefault: boolean;
  verifiedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentMethodSchema = new mongoose.Schema<PaymentMethodDocument>(
  {
    publicId: { type: String, required: true },
    userId: { type: String, required: true },
    type: { type: String, enum: ['BANK_ACCOUNT', 'UPI_ID'], required: true },
    uniqueKey: { type: String, required: true },
    label: { type: String, default: null },
    bank: {
      type: new mongoose.Schema(
        { bankName: String, accountHolderName: String, accountLast4: String, ifsc: String, accountType: String },
        { _id: false },
      ),
      default: null,
    },
    upi: { type: new mongoose.Schema({ vpa: String }, { _id: false }), default: null },
    isDefault: { type: Boolean, default: false },
    verifiedAt: { type: Date, required: true },
  },
  { collection: 'payment_methods', timestamps: true, versionKey: false },
);

paymentMethodSchema.index({ publicId: 1 }, { unique: true });
paymentMethodSchema.index({ userId: 1, uniqueKey: 1 }, { unique: true });
paymentMethodSchema.index({ userId: 1, createdAt: 1 });

export const PaymentMethodModel = mongoose.model<PaymentMethodDocument>('PaymentMethod', paymentMethodSchema);
