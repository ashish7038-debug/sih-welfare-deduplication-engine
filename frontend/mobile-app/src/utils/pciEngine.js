export const DEFECT_CATEGORIES = [
  'pothole',
  'alligator_crack',
  'longitudinal_crack',
  'lateral_crack',
  'rutting',
];

export const DEDUCT_VALUES = {
  LOW: 15,
  MEDIUM: 30,
  HIGH: 50,
};

export function classifySeverity(boxAreaRatio) {
  const ratio = Number(boxAreaRatio ?? 0);

  if (ratio < 0.05) return 'LOW';
  if (ratio < 0.15) return 'MEDIUM';
  return 'HIGH';
}

export function getDeductValue(className, boxAreaRatio) {
  const severity = classifySeverity(boxAreaRatio);
  void className;
  return DEDUCT_VALUES[severity] || 0;
}

export function evaluateInspection(detectedObjects = []) {
  const normalizedDetections = detectedObjects
    .map((item) => {
      const className = String(item?.class_name || item?.className || 'pothole').toLowerCase();
      const boxAreaRatio = Number(item?.box_area_ratio ?? item?.boxAreaRatio ?? 0);
      const severity = classifySeverity(boxAreaRatio);
      const deductValue = getDeductValue(className, boxAreaRatio);

      return {
        class_name: className,
        confidence: Number(item?.confidence ?? 0.9),
        box_area_ratio: boxAreaRatio,
        severity,
        deduct_value: deductValue,
      };
    })
    .filter((item) => DEFECT_CATEGORIES.includes(item.class_name) && item.deduct_value > 0)
    .sort((a, b) => b.deduct_value - a.deduct_value)
    .slice(0, 3);

  const totalDeduct = normalizedDetections.reduce((total, detection) => total + detection.deduct_value, 0);

  const pciScore = Math.max(0, 100 - totalDeduct);
  const dominantDetection = normalizedDetections[0] || {
    class_name: 'pothole',
    severity: 'LOW',
    deduct_value: 0,
  };

  return {
    total_deduct: totalDeduct,
    pci_score: pciScore,
    dominant_class: dominantDetection.class_name,
    max_severity: dominantDetection.severity,
    detections: normalizedDetections,
  };
}

export default evaluateInspection;
