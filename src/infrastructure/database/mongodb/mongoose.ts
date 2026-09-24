import mongoose from 'mongoose';

mongoose.set('strictQuery', true);
// Casts untrusted filter objects so values such as { $ne: null } cannot act as operators.
mongoose.set('sanitizeFilter', true);

export { mongoose };
