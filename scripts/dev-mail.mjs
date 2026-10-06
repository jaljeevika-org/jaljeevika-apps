/**
 * Local mail catcher for development and the end-to-end tests. Nothing is
 * delivered to real inboxes: messages are kept in memory and shown at
 * http://127.0.0.1:1080 (JSON at /api/messages).
 *
 *   npm run mail:dev
 *   then in .env.development.local:
 *     EMAIL_PROVIDER=smtp
 *     SMTP_HOST=127.0.0.1
 *     SMTP_PORT=1025
 *     FROM_EMAIL=no-reply@jaljeevika.local
 */
import http from "node:http";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";

const SMTP_PORT = Number(process.env.DEV_MAIL_SMTP_PORT ?? 1025);
const HTTP_PORT = Number(process.env.DEV_MAIL_HTTP_PORT ?? 1080);
const messages = [];
let nextId = 1;

const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  logger: false,
  onData(stream, session, callback) {
    simpleParser(stream)
      .then((mail) => {
        messages.unshift({
          id: nextId++,
          to: (mail.to?.value ?? []).map((a) => a.address?.toLowerCase()),
          from: mail.from?.text ?? "",
          subject: mail.subject ?? "",
          text: mail.text ?? "",
          html: typeof mail.html === "string" ? mail.html : "",
          date: new Date().toISOString(),
        });
        if (messages.length > 500) messages.length = 500;
        console.log(`[dev-mail] ${mail.subject} → ${(mail.to?.value ?? []).map((a) => a.address).join(", ")}`);
        callback();
      })
      .catch(callback);
  },
});

smtp.listen(SMTP_PORT, "127.0.0.1", () => console.log(`[dev-mail] SMTP on 127.0.0.1:${SMTP_PORT}`));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname === "/api/messages" && req.method === "GET") {
      const to = url.searchParams.get("to")?.toLowerCase();
      const list = to ? messages.filter((m) => m.to.includes(to)) : messages;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(list));
      return;
    }
    if (url.pathname === "/api/messages" && req.method === "DELETE") {
      messages.length = 0;
      res.writeHead(204).end();
      return;
    }
    const id = Number(url.pathname.match(/^\/m\/(\d+)$/)?.[1]);
    if (id) {
      const m = messages.find((x) => x.id === id);
      res.writeHead(m ? 200 : 404, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "script-src 'none'" });
      res.end(m ? m.html || `<pre>${esc(m.text)}</pre>` : "Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "script-src 'none'" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Dev mail</title>
<style>body{font:14px system-ui;margin:24px;color:#1b1d2e}li{margin:6px 0}a{color:#5550c4}</style>
<h1>Dev mail (${messages.length})</h1><ul>${messages
      .map((m) => `<li><a href="/m/${m.id}">${esc(m.subject)}</a> → ${esc(m.to.join(", "))} <small>${esc(m.date)}</small></li>`)
      .join("")}</ul>`);
  })
  .listen(HTTP_PORT, "127.0.0.1", () => console.log(`[dev-mail] inbox at http://127.0.0.1:${HTTP_PORT}`));
