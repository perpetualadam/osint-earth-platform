import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, mapOpenHref } from "../../src/lib/digestHtml.js";

describe("digestHtml", () => {
  it("escapeHtml escapes special characters", () => {
    assert.equal(escapeHtml(`a<b>&"'`), "a&lt;b&gt;&amp;&quot;&#39;");
  });

  it("mapOpenHref builds event and anomaly URLs", () => {
    assert.equal(mapOpenHref("https://app.example.com", "event", 42), "https://app.example.com/?event=42");
    assert.equal(mapOpenHref("https://app.example.com/", "anomaly", 7), "https://app.example.com/?anomaly=7");
    assert.equal(mapOpenHref("", "event", 1), "");
    assert.equal(mapOpenHref("https://x.com", "event", null), "");
  });
});
