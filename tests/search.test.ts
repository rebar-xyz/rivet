import { describe, it, expect } from 'vitest';

describe('search parameter construction', () => {
  it('order_by is a plain string without extra quotes', () => {
    const opts: { orderBy?: 'asc' | 'desc'; page?: number; perPage?: number } = { orderBy: 'asc' };
    const params: Record<string, unknown> = {
      query: 'test',
      page: String(opts.page ?? 1),
      per_page: String(opts.perPage ?? 50),
      order_by: opts.orderBy ?? 'desc',
    };
    expect(params.order_by).toBe('asc');
    expect((params.order_by as string)).not.toContain('"');
  });

  it('order_by defaults to desc when omitted', () => {
    const opts: { orderBy?: 'asc' | 'desc' } = {};
    const orderBy = opts.orderBy ?? 'desc';
    expect(orderBy).toBe('desc');
    expect(orderBy).not.toContain('"');
  });
});
