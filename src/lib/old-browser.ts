import en from "../../messages/en/common.json";
import zhHans from "../../messages/zh-Hans/common.json";
import zhHant from "../../messages/zh-Hant/common.json";
import tl from "../../messages/tl/common.json";

/** Internet Explorer (retired by Microsoft in 2022) cannot run this app. */
export function isOldBrowser(userAgent: string): boolean {
  return /MSIE |Trident\//.test(userAgent);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A plain page Internet Explorer can show: "please use Chrome or Edge", in all 4 languages, with an "open in Edge" button. */
export function oldBrowserPage(url: string): string {
  const u = esc(url);
  const blocks = [en, zhHans, zhHant, tl].map((m) => `
    <div style="margin:0 0 22px 0;padding:16px;border:1px solid #e5ddd3;background:#ffffff">
      <h2 style="margin:0 0 6px 0;font-size:20px;color:#1f2d1f">${esc(m.oldBrowserTitle)}</h2>
      <p style="margin:0 0 12px 0;font-size:15px;color:#4a3b2f">${esc(m.oldBrowserText)}</p>
      <a href="microsoft-edge:${u}" style="display:inline-block;padding:10px 16px;background:#b81c21;color:#ffffff;text-decoration:none;font-weight:bold">${esc(m.openInEdge)}</a>
      <p style="margin:12px 0 0 0;font-size:14px;color:#4a3b2f">${esc(m.orChrome)}<br><b style="word-break:break-all">${u}</b></p>
    </div>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Sunny Foods</title></head>
<body style="margin:0;padding:24px;background:#faf6f1;font-family:Arial,'Microsoft YaHei',sans-serif">
<div style="max-width:640px;margin:0 auto">
<p style="text-align:center;margin:0 0 20px 0"><img src="/logo.png" alt="Sunny Foods" width="300" height="154"></p>
${blocks}
</div></body></html>`;
}
