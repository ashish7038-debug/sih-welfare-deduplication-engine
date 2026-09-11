// PCI Severity Deduct Value Mapping
export const DEDUCT_WEIGHTS = {
  Low: 10,
  Medium: 25,
  High: 50,
};

// Determine severity based on pothole bounding box area ratio on screen
export const calculateSeverity = (boxAreaRatio) => {
  if (boxAreaRatio < 0.05) {
    return 'Low';
  } else if (boxAreaRatio < 0.15) {
    return 'Medium';
  } else {
    return 'High';
  }
};

// Get Deduct Value for calculated severity
export const getDeductValue = (severity) => {
  return DEDUCT_WEIGHTS[severity] || 10;
};