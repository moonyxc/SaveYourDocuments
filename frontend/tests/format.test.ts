import assert from "node:assert/strict";
import test from "node:test";
import { dateTime, parseEuro } from "../src/lib/format.ts";

test("amounts accept decimal points and German grouping without changing their value", () => {
  assert.equal(parseEuro("49.90"), 4990);
  assert.equal(parseEuro("49,90"), 4990);
  assert.equal(parseEuro("1.234,56 €"), 123456);
  assert.equal(parseEuro("12.345"), 1234500);
  assert.equal(parseEuro("-0,50"), -50);
  assert.equal(parseEuro("1.2.3"), null);
});

test("timestamps with compact offsets are rendered in local time", () => {
  const timestamp = "2024-06-01T10:00:00+0200";
  assert.equal(
    dateTime(timestamp),
    new Date(timestamp).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }),
  );
});
