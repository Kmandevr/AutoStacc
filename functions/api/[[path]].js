// Cloudflare Pages Function for every /api/* request. All logic lives in server/ (see server/app.js).
import { handleApi } from "../../server/app.js";

export const onRequest = (context) => handleApi(context.request, context.env, context);
