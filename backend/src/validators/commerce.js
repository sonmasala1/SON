import { z } from 'zod';
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const cartItem = z.object({ productId: objectId, variantId: objectId, quantity: z.number().int().min(1).max(99).default(1) }).strict();
export const quantityInput = z.object({ quantity: z.number().int().min(1).max(99) }).strict();
export const deliveryInput = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  address: z.string().trim().min(8).max(300),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().regex(/^[1-9]\d{5}$/),
}).strict();
export const reviewInput = z.object({ productId: objectId, displayName: z.string().trim().min(2).max(60), rating: z.number().int().min(1).max(5), comment: z.string().trim().min(10).max(1500) }).strict();
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw Object.assign(new Error(result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')), { status: 400 });
  return result.data;
}
