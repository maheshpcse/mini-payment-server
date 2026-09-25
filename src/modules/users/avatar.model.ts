import { mongoose } from '../../infrastructure/database/mongodb/mongoose.js';

/** Small, pre-resized images (≤ 512 KB). Larger media would move to object storage. */
export interface AvatarDocument {
  avatarId: string;
  userId: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  data: Buffer;
  size: number;
  createdAt: Date;
}

const avatarSchema = new mongoose.Schema<AvatarDocument>(
  {
    avatarId: { type: String, required: true },
    userId: { type: String, required: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'avatars', versionKey: false },
);

avatarSchema.index({ avatarId: 1 }, { unique: true });
avatarSchema.index({ userId: 1 });

export const AvatarModel = mongoose.model<AvatarDocument>('Avatar', avatarSchema);
