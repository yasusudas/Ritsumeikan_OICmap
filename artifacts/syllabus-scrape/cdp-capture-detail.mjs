import fs from "node:fs";

const port = process.argv[2] || "9224";
const url = process.argv[3];
if (!url) throw new Error("Usage: node cdp-capture-detail.mjs <port> <url>");

const targets = await fetch(`http://127.0.0.1:${port}/json`).then((res) => res.json());
const page = targets.find((target) => target.type === "page");
if (!page) throw new Error("No page target found");

let nextId = 1;
const pending = new Map();
const events = [];
const requestIds = new Set();
const ws = new WebSocket(page.webSocketDebuggerUrl);

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

ws.addEventListener("message", (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    const request = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) request.reject(new Error(`${request.method}: ${JSON.stringify(data.error)}`));
    else request.resolve(data.result);
    return;
  }
  if (data.method?.startsWith("Network.")) {
    events.push({ method: data.method, params: data.params });
    const eventUrl = data.params?.request?.url || data.params?.response?.url || "";
    if (eventUrl.includes("/sfsites/aura")) requestIds.add(data.params.requestId);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

await send("Network.enable");
await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url });
await wait(10000);

const textResult = await send("Runtime.evaluate", {
  expression: "document.body.innerText",
  returnByValue: true,
});

const bodies = [];
for (const requestId of requestIds) {
  try {
    bodies.push({ requestId, body: await send("Network.getResponseBody", { requestId }) });
  } catch (error) {
    bodies.push({ requestId, error: error.message });
  }
}

const slug = url.split("/").slice(-2).join("-");
const savePath = `artifacts/syllabus-scrape/syllabus-detail-${slug}.json`;
fs.writeFileSync(savePath, JSON.stringify({
  url,
  bodyText: textResult.result.value,
  events,
  bodies,
}, null, 2));

const auraRequests = events
  .filter((event) => event.method === "Network.requestWillBeSent")
  .map((event) => event.params.request)
  .filter((request) => request.url.includes("/sfsites/aura"))
  .map((request) => ({
    url: request.url,
    method: request.method,
    postData: request.postData?.slice(0, 3000) || "",
  }));

console.log(JSON.stringify({
  textPreview: textResult.result.value?.slice(0, 1200),
  auraRequests,
  bodyCount: bodies.length,
  saved: savePath,
}, null, 2));

ws.close();
