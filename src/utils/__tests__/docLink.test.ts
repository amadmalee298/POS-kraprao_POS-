import { describe, expect, it } from 'vitest';

describe('the expense in the link', () => {
  it('carries the expense id so a signature can be saved with it', async () => {
    const { decodeDocLink, encodeDocLink } = await import('../docLink');
    const data = { shop: { name: 'ร้าน' }, expense: { id: 'exp-9', date: '2026-10-22', title: 'x', amount: 1, note: '', substituteReceipt: { docNo: '2569/10-001', spender: 'ก' } } };
    expect(decodeDocLink(encodeDocLink(data))!.expense.id).toBe('exp-9');
    const { id: _id, ...noId } = data.expense;
    void _id;
    expect(decodeDocLink(encodeDocLink({ ...data, expense: noId }))!.expense.id).toBeUndefined();
  });
});
