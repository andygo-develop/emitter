/**
 * Shared event map used across all spec files.
 */
export interface TestEvents {
  'user.created': { id: number; email: string };
  'user.deleted': { id: number };
  'order.paid': { orderId: number; amount: number };
}
