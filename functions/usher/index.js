import { usherPage } from "../../lib/ui.js";

export const onRequestGet = ({ env, data }) => usherPage(env, data.who);
