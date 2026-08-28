import net from "net";

/**
 * Refuse to start when the expected port is taken.
 *
 * `next dev` quietly shifts to the next free port when 3000 is busy, but
 * AUTH_URL in .env stays pointing at 3000. Sign-in then redirects to whatever
 * else is listening there, which presents as "a different application opened"
 * rather than as a port conflict, and is genuinely hard to diagnose.
 *
 * Failing here, with the offending port named, is far cheaper than that.
 */
const url = process.env.AUTH_URL ?? "http://localhost:3000";
const port = Number(new URL(url).port || 3000);

const server = net.createServer();

server.once("error", (err) => {
  if (err.code !== "EADDRINUSE") throw err;
  console.error(`
  Port ${port} is already in use.

  AUTH_URL is set to ${url}, so the app must serve that exact port. If Next
  starts on a different one, sign-in will redirect to whatever is already
  running on ${port} instead.

  Either free the port:
      Get-NetTCPConnection -LocalPort ${port} -State Listen | Select OwningProcess
      Stop-Process -Id <pid>

  or point the app at the port you want in frontend/.env:
      AUTH_URL="http://localhost:<port>"
  and set CORS_ORIGIN in backend/.env to match.
`);
  process.exit(1);
});

server.once("listening", () => server.close(() => process.exit(0)));
// Bind the same way Next does (all interfaces). Binding only 127.0.0.1 would
// succeed on Windows even when another process already holds 0.0.0.0:port.
server.listen(port);
