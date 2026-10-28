import { z } from 'zod';

export const productQuery = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().regex(/^[a-z0-9-]{1,120}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
  featured: z.enum(['true', 'false']).optional(),
  offers: z.enum(['true', 'false']).optional(),
  sort: z.enum(['price-asc', 'price-desc']).optional(),
});
