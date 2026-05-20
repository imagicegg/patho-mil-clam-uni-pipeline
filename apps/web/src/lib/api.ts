import { SlideRecord } from '@/types/slide';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function listSlides() {
  return requestJson<SlideRecord[]>('/slides');
}

export function getSlide(slideId: string) {
  return requestJson<SlideRecord>(`/slides/${slideId}`);
}

export function getSlideAssetUrl(slideId: string, asset: 'thumbnail' | 'heatmap') {
  return `${API_BASE_URL}/slides/${slideId}/assets/${asset}`;
}

export function getSlideFocusRoiUrl(
  slideId: string,
  region: { x: number; y: number; width: number; height: number },
) {
  return `${API_BASE_URL}/slides/${slideId}/assets/focus-roi/${region.x}/${region.y}/${region.width}/${region.height}.jpg`;
}

export function getSlideDziUrl(slideId: string) {
  return `${API_BASE_URL}/slides/${slideId}/wsi.dzi`;
}

export function getSlideHeatmapDziUrl(slideId: string) {
  return `${API_BASE_URL}/slides/${slideId}/ai-heatmap.dzi`;
}