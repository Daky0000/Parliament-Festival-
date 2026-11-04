import { guard } from "../../lib/auth.js";

export const onRequest = (context) => guard(context, ["super", "admin", "usher"]);
