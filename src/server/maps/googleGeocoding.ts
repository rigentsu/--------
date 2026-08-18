import type { GeoPoint, SupportResource } from "../../shared/types";

export type GoogleMapsEnv = {
  GOOGLE_MAPS_API_KEY?: string;
};

export class GoogleMapsError extends Error {
  readonly code = "GOOGLE_MAPS_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "GoogleMapsError";
  }
}

type GeocodingResponse = {
  status?: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
};

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_REQUEST_TIMEOUT_MS = 10_000;

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function requireApiKey(env: GoogleMapsEnv) {
  const apiKey = env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    throw new GoogleMapsError(
      "郵便番号から距離を計算するにはGOOGLE_MAPS_API_KEYを設定してください。",
    );
  }
  return apiKey;
}

function isValidPoint(point: { lat?: number; lng?: number } | undefined): point is {
  lat: number;
  lng: number;
} {
  return (
    typeof point?.lat === "number" &&
    Number.isFinite(point.lat) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lng) &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

async function requestGeocode(
  parameters: Record<string, string>,
  env: GoogleMapsEnv,
): Promise<GeoPoint | null> {
  const query = new URLSearchParams({
    ...parameters,
    language: "ja",
    key: requireApiKey(env),
  });
  const url = `${GEOCODING_URL}?${query.toString()}`;

  try {
    return await withTimeout(async (signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new GoogleMapsError(
          `Google Geocoding APIへの接続に失敗しました（HTTP ${response.status}）。`,
        );
      }

      const payload = (await response.json()) as GeocodingResponse;
      if (payload.status === "ZERO_RESULTS") return null;
      if (payload.status !== "OK") {
        throw new GoogleMapsError(
          `Google Geocoding APIが位置情報を返しませんでした（status=${payload.status ?? "unknown"}）。`,
        );
      }

      const location = payload.results?.[0]?.geometry?.location;
      if (!isValidPoint(location)) {
        throw new GoogleMapsError(
          "Google Geocoding APIから有効な緯度・経度が返りませんでした。",
        );
      }

      return { latitude: location.lat, longitude: location.lng };
    }, GOOGLE_REQUEST_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof GoogleMapsError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GoogleMapsError(
        "Google Geocoding APIへの接続がタイムアウトしました（10秒）。",
      );
    }
    throw new GoogleMapsError("Google Geocoding APIに接続できませんでした。");
  }
}

export async function geocodePostalCode(
  postalCode: string,
  env: GoogleMapsEnv,
): Promise<GeoPoint> {
  const location = await requestGeocode(
    { components: `postal_code:${postalCode}|country:JP`, region: "jp" },
    env,
  );
  if (!location) {
    throw new GoogleMapsError(
      "入力された郵便番号の位置を確認できませんでした。7桁の郵便番号を確認してください。",
    );
  }
  return location;
}

async function geocodeAddress(address: string, env: GoogleMapsEnv) {
  return requestGeocode({ address, components: "country:JP", region: "jp" }, env);
}

export async function geocodeSupportResources(
  resources: SupportResource[],
  env: GoogleMapsEnv,
): Promise<SupportResource[]> {
  requireApiKey(env);
  const cache = new Map<string, Promise<GeoPoint | null>>();

  return Promise.all(
    resources.map(async (resource) => {
      if (
        typeof resource.latitude === "number" &&
        typeof resource.longitude === "number"
      ) {
        return resource;
      }
      const address = resource.address?.trim();
      const fallbackQuery = [resource.municipality, resource.name]
        .filter(
          (value) =>
            value && value !== "情報源から抽出した支援情報",
        )
        .join(" ");
      const query = address || fallbackQuery;
      if (!query) return resource;

      let locationRequest = cache.get(query);
      if (!locationRequest) {
        locationRequest = geocodeAddress(query, env);
        cache.set(query, locationRequest);
      }
      const location = await locationRequest;
      return {
        ...resource,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      };
    }),
  );
}
