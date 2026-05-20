export interface SlideDiagnosis {
  slide_id: string;
  predicted_index: number;
  predicted_label: 'Normal' | 'Tumor';
  probabilities: [number, number];
  runtime_seconds: number;
  warning_summary: {
    high_risk_area_ratio: number;
    suspicious_focus_count: number;
    largest_focus_area_ratio: number;
    largest_focus_patch_count: number;
    foci: {
      id: number;
      patch_count: number;
      area_ratio: number;
      x: number;
      y: number;
      width: number;
      height: number;
      center_x: number;
      center_y: number;
    }[];
  };
}

export interface SlideRecord {
  id: string;
  filename: string;
  slice_no?: string | null;
  anatomy_location?: string | null;
  stain_type?: string | null;
  thumbnail_url?: string | null;
  ai_prediction_status?: 'positive' | 'negative' | 'pending' | null;
  width: number;
  height: number;
  mpp_x: number | null;
  objective_power: number | null;
  diagnosis: SlideDiagnosis | null;
  patch_count: number | null;
  status: 'positive' | 'negative' | 'pending';
}