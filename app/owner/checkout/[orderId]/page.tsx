// Owner checkout reuses reception's table-checkout screen — it's a client
// component driven by the shared auth store, so it targets the owner's own
// restaurant unchanged.
export { default } from '@/app/reception/checkout/[orderId]/page';
