import fs from "node:fs";

const port = process.argv[2] || "9224";
const week = process.argv[3] || "月";
const period = process.argv[4] || "1";
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((res) => res.json());
const page = targets.find((target) => target.type === "page");
if (!page) throw new Error("No page target found");

let nextId = 1;
const pending = new Map();
const events = [];
const auraRequestIds = new Set();
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
    if (data.error) request.reject(new Error(`${request.method}: ${JSON.stringify(data.error)}`));
    else request.resolve(data.result);
    return;
  }
  if (data.method?.startsWith("Network.")) {
    events.push({ method: data.method, params: data.params });
    const url = data.params?.request?.url || data.params?.response?.url || "";
    if (url.includes("/sfsites/aura")) {
      auraRequestIds.add(data.params.requestId);
    }
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

await send("Network.enable");
await send("Runtime.enable");

const expression = `(() => {
  const page = document.querySelector('c-r_-syllabus-public-page');
  const root = page.shadowRoot;
  function checkbox(groupName, value) {
    const group = Array.from(root.querySelectorAll('lightning-checkbox-group')).find((el) => el.name === groupName);
    return Array.from(group.shadowRoot.querySelectorAll('input[type="checkbox"]')).find((el) => el.value === value);
  }
  const weekInput = checkbox('selected-week', ${JSON.stringify(week)});
  const periodInput = checkbox('selected-period', ${JSON.stringify(period)});
  if (!weekInput || !periodInput) throw new Error('checkbox not found');
  if (!weekInput.checked) weekInput.click();
  if (!periodInput.checked) periodInput.click();
  const search = Array.from(root.querySelectorAll('lightning-button')).find((el) => el.label === '検索');
  search.shadowRoot.querySelector('button').click();
  return { week: weekInput.checked, period: periodInput.checked };
})()`;

const clickResult = await send("Runtime.evaluate", {
  expression,
  returnByValue: true,
  awaitPromise: true,
});

await wait(8000);

const bodies = [];
for (const requestId of auraRequestIds) {
  try {
    const body = await send("Network.getResponseBody", { requestId });
    bodies.push({ requestId, body });
  } catch (error) {
    bodies.push({ requestId, error: error.message });
  }
}

const out = { week, period, clickResult, events, bodies };
const savePath = `artifacts/syllabus-scrape/syllabus-search-${week}-${period}.json`;
fs.writeFileSync(savePath, JSON.stringify(out, null, 2));

const requestSummaries = events
  .filter((event) => event.method === "Network.requestWillBeSent")
  .map((event) => event.params.request)
  .filter((request) => request.url.includes("/sfsites/aura"))
  .map((request) => ({
    url: request.url,
    method: request.method,
    postData: request.postData?.slice(0, 2000) || "",
  }));

console.log(JSON.stringify({
  clicked: clickResult.result.value,
  auraRequests: requestSummaries,
  bodyCount: bodies.length,
  saved: savePath,
}, null, 2));

ws.close();
