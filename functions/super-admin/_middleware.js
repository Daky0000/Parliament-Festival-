import { guard } from "../../lib/auth.js";

// The owner only.
export const onRequest = (context) => guard(context, ["super"]);
