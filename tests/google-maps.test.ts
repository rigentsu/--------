import assert from "node:assert/strict";
import test from "node:test";
import rawResources from "../src/data/miraitizu-resources.json";
import {
  geocodePostalCode,
  geocodeSupportResources,
} from "../src/server/maps/googleGeocoding";
import type { SupportResource } from "../src/shared/types";

test("郵便番号をGoogle Geocodingの座標へ変換する", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return Response.json({
      status: "OK",
      results: [{ geometry: { location: { lat: 35.75, lng: 139.85 } } }],
    });
  }) as typeof fetch;

  try {
    const point = await geocodePostalCode("1250061", {
      GOOGLE_MAPS_API_KEY: "test-only-key",
    });
    const url = new URL(requestedUrl);

    assert.deepEqual(point, { latitude: 35.75, longitude: 139.85 });
    assert.equal(
      url.searchParams.get("components"),
      "postal_code:1250061|country:JP",
    );
    assert.equal(url.searchParams.get("language"), "ja");
    assert.equal(url.searchParams.get("key"), "test-only-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("同じ施設住所は一度だけジオコーディングする", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = (async () => {
    requestCount += 1;
    return Response.json({
      status: "OK",
      results: [{ geometry: { location: { lat: 35.75, lng: 139.85 } } }],
    });
  }) as typeof fetch;

  const resources = [
    {
      ...rawResources[0],
      id: "located-1",
      address: "東京都葛飾区立石1-2-3",
      latitude: null,
      longitude: null,
    },
    {
      ...rawResources[0],
      id: "located-2",
      address: "東京都葛飾区立石1-2-3",
      latitude: null,
      longitude: null,
    },
  ] as SupportResource[];

  try {
    const located = await geocodeSupportResources(resources, {
      GOOGLE_MAPS_API_KEY: "test-only-key",
    });

    assert.equal(requestCount, 1);
    assert.deepEqual(
      located.map((resource) => [resource.latitude, resource.longitude]),
      [
        [35.75, 139.85],
        [35.75, 139.85],
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
