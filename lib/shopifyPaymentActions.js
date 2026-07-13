import { shopifyGraphql } from './shopifyProductLookup';

/**
 * Manual approve / decline for orders whose payment happened OUTSIDE Shopify
 * (bank transfer, cash paid directly to the owner). Shopify leaves these
 * "Pending", so they never reach the orders/paid webhook and were previously
 * invisible to the dashboard.
 *
 * Deliberately manual — a human checks the bank and clicks. Nothing here runs
 * automatically, and there is no automated refund path: declining cancels the
 * order, it does not move money. Refunds stay a human, out-of-band action.
 */

const ORDER_MARK_AS_PAID = `
  mutation OrderMarkAsPaid($input: OrderMarkAsPaidInput!) {
    orderMarkAsPaid(input: $input) {
      order {
        id
        name
        displayFinancialStatus
      }
      userErrors { field message }
    }
  }
`;

const ORDER_CANCEL = `
  mutation OrderCancel($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!, $notifyCustomer: Boolean) {
    orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock, notifyCustomer: $notifyCustomer) {
      job { id }
      orderCancelUserErrors { field message }
    }
  }
`;

function toOrderGid(orderId) {
  const raw = String(orderId || '').trim();
  if (!raw) throw new Error('orderId is required');
  return raw.startsWith('gid://') ? raw : `gid://shopify/Order/${raw}`;
}

/**
 * APPROVE — the money arrived. Marks the order paid in Shopify.
 *
 * This is intentionally the only thing it does: marking it paid makes Shopify
 * fire its own orders/paid webhook, which the dashboard already handles
 * (code-chain advance, gold-rate snapshot, sold detection). Duplicating any of
 * that here would risk it running twice.
 */
export async function approveOrderPayment(domain, token, orderId) {
  const id = toOrderGid(orderId);
  const data = await shopifyGraphql(domain, token, ORDER_MARK_AS_PAID, {
    input: { id },
  });
  const errors = data?.orderMarkAsPaid?.userErrors || [];
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }
  return { order: data?.orderMarkAsPaid?.order || null };
}

/**
 * DECLINE — the money never came. Cancels the order and restocks it.
 *
 * refund:false — nothing was ever captured through Shopify, so there is
 * nothing for Shopify to refund. If money DID somehow arrive, returning it is
 * a manual, out-of-band action by staff (bank transfer back / normal payment
 * method), on purpose: an automated refund path could send real money without
 * a human checking.
 */
export async function declineOrderPayment(domain, token, orderId, { notifyCustomer = false } = {}) {
  const id = toOrderGid(orderId);
  const data = await shopifyGraphql(domain, token, ORDER_CANCEL, {
    orderId: id,
    reason: 'CUSTOMER',
    refund: false,
    restock: true,
    notifyCustomer: Boolean(notifyCustomer),
  });
  const errors = data?.orderCancel?.orderCancelUserErrors || [];
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }
  return { job: data?.orderCancel?.job || null };
}
