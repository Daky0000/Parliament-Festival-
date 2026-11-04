import { listUsers, readLog, publicUser } from "../../lib/users.js";
import { managePage } from "../../lib/ui.js";

export async function onRequestGet({ env, data }) {
  const users = env.USERS ? (await listUsers(env)).map(publicUser) : [];
  const log = env.USERS ? await readLog(env) : [];
  return managePage(env, data.who, users, log, "/admin");
}
