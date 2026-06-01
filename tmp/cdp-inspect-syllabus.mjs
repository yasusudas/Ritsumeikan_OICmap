import fs from "node:fs";

const port = process.argv[2] || "9223";
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((res) => res.json());
const page = targets.find((target) => target.type === "page");
if (!page) {
  throw new Error("No Chrome page target found");
}

let nextId = 1;
const pending = new Map();
const events = [];
const ws = new WebSocket(page.webSocketDebuggerUrl);

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

ws.addEventListener("message", (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending.has(data.id)) {
    const request = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) {
      request.reject(new Error(`${request.method}: ${JSON.stringify(data.error)}`));
    } else {
      request.resolve(data.result);
    }
    return;
  }
  if (data.method?.startsWith("Network.")) {
    events.push({ method: data.method, params: data.params });
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

await send("Network.enable");
await send("Page.enable");
await send("Runtime.enable");

await send("Page.reload", { ignoreCache: true });
await wait(15000);

const textResult = await send("Runtime.evaluate", {
  expression: "document.body.innerText",
  returnByValue: true,
});
const htmlResult = await send("Runtime.evaluate", {
  expression: "document.documentElement.outerHTML",
  returnByValue: true,
});

const auraRequests = events
  .filter((event) => event.method === "Network.requestWillBeSent")
  .map((event) => event.params.request)
  .filter((request) => request.url.includes("/sfsites/aura") || request.postData?.includes("Syllabus"));

const responseSummaries = events
  .filter((event) => event.method === "Network.responseReceived")
  .map((event) => event.params.response)
  .filter((response) => response.url.includes("/sfsites/aura") || response.url.toLowerCase().includes("syllabus"));

const out = {
  url: page.url,
  title: page.title,
  bodyText: textResult.result.value,
  htmlLength: htmlResult.result.value?.length,
  auraRequests,
  responseSummaries,
  eventCount: events.length,
};

fs.writeFileSync("tmp/syllabus-cdp-inspect.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  bodyTextPreview: out.bodyText?.slice(0, 1000),
  auraRequestCount: auraRequests.length,
  responseCount: responseSummaries.length,
  htmlLength: out.htmlLength,
  saved: "tmp/syllabus-cdp-inspect.json",
}, null, 2));

ws.close();
