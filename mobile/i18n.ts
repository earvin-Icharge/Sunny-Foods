// Store app: screen text is bundled from ../messages (no server). Language comes from the phone setting / saved choice.
import { getRequestConfig } from "next-intl/server";
import common from "../messages/en/common.json";
import nav from "../messages/en/nav.json";
import status from "../messages/en/status.json";
import auth from "../messages/en/auth.json";
import portal from "../messages/en/portal.json";
import checkout from "../messages/en/checkout.json";
import orderBreakdown from "../messages/en/orderBreakdown.json";
import legal from "../messages/en/legal.json";

export default getRequestConfig(async () => ({
  locale: "en",
  messages: { common, nav, status, auth, portal, checkout, orderBreakdown, legal },
  timeZone: "Asia/Manila",
}));
