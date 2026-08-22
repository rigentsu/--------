import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the first consultation experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /よりそいナビ/);
  assert.match(html, /相談の入口/);
  assert.match(html, /まず、あなたの呼び方を教えてください/);
  assert.match(html, /本名を入力する必要はありません/);
  assert.match(html, /条件を設定する/);
  assert.match(html, /利用できそうな支援を探す/);
  assert.match(html, /ご予算・世帯状況/);
  assert.match(html, /郵便番号（任意）/);
  assert.match(html, /葛飾区（デモ対象）/);
  assert.match(html, /いま一番求めていること/);
  assert.match(html, /学校に知られず匿名で相談したい/);
  assert.match(html, /開発デモ/);
  assert.match(html, /相談内容は保存されません/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});
