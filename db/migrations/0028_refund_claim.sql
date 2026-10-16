-- A self-service refund claims its order before it checks for downloads a second time and calls the payment provider
-- (server/orders/refunds.js), and using a bought site template checks for that claim after it logs its download
-- (server/library/routes.js): whichever comes first wins, so a refund and a use at the same moment can't both succeed.
-- Cleared again when the provider refuses the refund.
ALTER TABLE orders ADD COLUMN refund_claimed_at TEXT;
