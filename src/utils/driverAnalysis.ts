
export interface TelemetryPoint {
  timestamp: number;
  speed: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  steering: number;
}

export interface LapData {
  lap: number;
  time: number;
  timestamp: number;
}

// Linear interpolation helper
const interpolate = (data: number[], targetLength: number): number[] => {
  if (data.length < 2) return new Array(targetLength).fill(0);
  
  const result = [];
  const step = (data.length - 1) / (targetLength - 1);
  
  for (let i = 0; i < targetLength; i++) {
    const index = i * step;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    if (upper >= data.length) {
      result.push(data[data.length - 1]);
    } else {
      result.push(data[lower] * (1 - weight) + data[upper] * weight);
    }
  }
  return result;
};

export const getLapTelemetry = (
  telemetry: TelemetryPoint[], 
  laps: LapData[], 
  lapNumber: number
): TelemetryPoint[] => {
  const currentLap = laps.find(l => l.lap === lapNumber);
  if (!currentLap) return [];

  const nextLap = laps.find(l => l.lap === lapNumber + 1);
  const startTime = currentLap.timestamp;
  // If next lap exists, use its start as end. Otherwise use current + duration (converted to ms)
  const endTime = nextLap ? nextLap.timestamp : startTime + (currentLap.time * 1000);

  return telemetry.filter(p => p.timestamp >= startTime && p.timestamp < endTime);
};

export const findFastestLap = (laps: LapData[]): number | null => {
  if (!laps || laps.length === 0) return null;
  // Filter out invalid laps (e.g. < 20s)
  const validLaps = laps.filter(l => l.time > 20);
  if (validLaps.length === 0) return null;
  
  return validLaps.sort((a, b) => a.time - b.time)[0].lap;
};

export const getSignificantBrakingSegment = (lapData: TelemetryPoint[]): number[] => {
  // Find contiguous segments where brake > 10%
  const segments: TelemetryPoint[][] = [];
  let currentSegment: TelemetryPoint[] = [];
  
  lapData.forEach(p => {
    if ((p.brake || 0) > 10) { // Threshold 10%
      currentSegment.push(p);
    } else {
      if (currentSegment.length > 5) { // Min duration
        segments.push(currentSegment);
      }
      currentSegment = [];
    }
  });
  
  if (currentSegment.length > 5) segments.push(currentSegment);
  
  if (segments.length === 0) return [];
  
  // Find segment with highest peak brake pressure
  const bestSegment = segments.reduce((prev, current) => {
    const prevMax = Math.max(...prev.map(p => p.brake || 0));
    const currMax = Math.max(...current.map(p => p.brake || 0));
    return currMax > prevMax ? current : prev;
  });
  
  // Extract brake values and normalize to 100 points
  const values = bestSegment.map(p => p.brake || 0);
  return interpolate(values, 100);
};

export const getSignificantThrottleSegment = (lapData: TelemetryPoint[]): number[] => {
  // Find contiguous segments where throttle > 5%
  const segments: TelemetryPoint[][] = [];
  let currentSegment: TelemetryPoint[] = [];
  
  lapData.forEach(p => {
    if ((p.throttle || 0) > 5) {
      currentSegment.push(p);
    } else {
      if (currentSegment.length > 10) { // Min duration slightly longer for throttle
        segments.push(currentSegment);
      }
      currentSegment = [];
    }
  });
  
  if (currentSegment.length > 10) segments.push(currentSegment);
  
  if (segments.length === 0) return [];
  
  // Find longest throttle application (usually a main straight)
  const bestSegment = segments.reduce((prev, current) => {
    return current.length > prev.length ? current : prev;
  });
  
  const values = bestSegment.map(p => p.throttle || 0);
  return interpolate(values, 100);
};

export const analyzeDriverStyle = (
  brakeSegment: number[], 
  throttleSegment: number[]
): { brakeStyle: string; throttleStyle: string } => {
  let brakeStyle = "Balanced";
  let throttleStyle = "Smooth";
  
  // Analyze Brake (Peak timing)
  if (brakeSegment.length > 0) {
    const maxBrake = Math.max(...brakeSegment);
    const maxIndex = brakeSegment.indexOf(maxBrake);
    const progress = maxIndex / brakeSegment.length;
    
    if (progress < 0.2) brakeStyle = "Late Braker";
    else if (progress < 0.4) brakeStyle = "Aggressive";
    else brakeStyle = "Progressive";
  }
  
  // Analyze Throttle (Smoothness/Variance)
  if (throttleSegment.length > 0) {
    // Calculate variance/smoothness roughly
    let jumps = 0;
    for(let i=1; i<throttleSegment.length; i++) {
      if (Math.abs(throttleSegment[i] - throttleSegment[i-1]) > 5) jumps++;
    }
    
    if (jumps > 10) throttleStyle = "Aggressive";
    else if (jumps > 5) throttleStyle = "Modulated";
    else throttleStyle = "Smooth";
  }
  
  return { brakeStyle, throttleStyle };
};
