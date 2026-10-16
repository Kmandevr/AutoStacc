// Which community library piece a store product sells (docs/builder.md, phase 8). Its own small module so the
// product's readiness (creators/readiness.js) can ask without importing the library, which itself makes products.
import { first } from "../lib/db.js";

export const pieceOfProduct = (db, productId) => first(db, "SELECT id, status FROM library_pieces WHERE product_id = ?", productId);
