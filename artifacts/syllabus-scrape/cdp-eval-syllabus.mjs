const port = process.argv[2] || "9223";
const expression = process.argv.slice(3).join(" ");
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((res) => res.json());
const page = targets.find((target) => target.type === "page");
if (!page) throw new Error("No page target found");

let nextId = 1;
const pending = new Map();
const ws = new WebSocket(page.webSocketDebuggerUrl);

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
  });
}

ws.addEventListener("message", (message) => {
  const data = JSON.parse(message.data);
  if (!data.id || !pending.has(data.id)) return;
  const request = pending.get(data.id);
  pending.delete(data.id);
  if (data.error) request.reject(new Error(`${request.method}: ${JSON.stringify(data.error)}`));
  else request.resolve(data.result);
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

await send("Runtime.enable");
const result = await send("Runtime.evaluate", {
  expression,
  returnByValue: true,
  awaitPromise: true,
});

console.log(JSON.stringify(result.result.value, null, 2));
ws.close();
