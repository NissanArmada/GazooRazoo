// TrackGrip component - displays track conditions and grip analysis
import { useEffect, useState, useRef } from 'react';
import { Cloud, Thermometer, Gauge, AlertTriangle, TrendingUp } from 'lucide-react';

interface TrackGripProps {
  addAlert: (message: string, type: string) => void;
  telemetryData?: any[];
  weatherData?: any[];
}

interface Car {
  id: number;
  angle: number;
  distance: number;
  isPlayer: boolean;
  color: string;
  label: string;
}

interface GearMapEntry {
  minSpeed: number;
  maxSpeed: number;
  gear: number;
}

interface GearAlert {
  type: 'gear-mismatch' | 'shift-point';
  message: string;
  severity: 'warning' | 'critical';
  timestamp: number;
}

export default function TrackGrip({ addAlert, telemetryData, weatherData }: TrackGripProps) {
  const [airTemp, setAirTemp] = useState(0);
  const [trackTemp, setTrackTemp] = useState(0);
  const [gripLevel, setGripLevel] = useState(100);
  const [gripConfidence, setGripConfidence] = useState(0);
  const [expectedTimeDelta, setExpectedTimeDelta] = useState(0);
  const [weatherAlert, setWeatherAlert] = useState('');
  // Removed charts and radar refs and effects
  const throttleDataRef = useRef<number[]>([]);
  const brakeDataRef = useRef<number[]>([]);
  
  // Telemetry data for gear efficiency
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentGear, setCurrentGear] = useState(0);
  const [currentRPM, setCurrentRPM] = useState(0);
  const [gearAlerts, setGearAlerts] = useState<GearAlert[]>([]);
  
  // Playback state
  const playbackIndexRef = useRef(0);
  const lastFrameTimeRef = useRef(0);

  // Optimal gear map (updated from external tool) - overlapping ranges allowed
  // Format: gear, minSpeed, maxSpeed (km/h)
  const optimalGearMap: GearMapEntry[] = [
    { gear: 1, minSpeed: 69.0, maxSpeed: 103.1 },
    { gear: 2, minSpeed: 87.3, maxSpeed: 123.8 },
    { gear: 3, minSpeed: 123.9, maxSpeed: 152.0 },
    { gear: 4, minSpeed: 152.1, maxSpeed: 183.7 }
  ];

  // Optimal shift points (RPM) updated
  const optimalShiftRPM = {
    '1->2': 6930,
    '2->3': 7147,
    '3->4': 7171
  } as const;

  // Tolerance used when evaluating shift timing (RPM)
  const SHIFT_TOLERANCE_RPM = 500;
  // Downshift evaluation thresholds (heuristic)
  const DOWN_SHIFT_EARLY_MAX = 3500; // below this = early downshift (lugging)
  const DOWN_SHIFT_LATE_MIN = 8000; // above this = late downshift (over-rev risk)

  // Telemetry history for generating post-hoc reports (mechanical sympathy)
  const telemetryHistoryRef = useRef<Array<{ speed: number; gear: number; rpm: number; timestamp: number }>>([]);
  const [sympathyReport, setSympathyReport] = useState<{ total: number; optimal: number; early: number; late: number; score: string }>({
    total: 0,
    optimal: 0,
    early: 0,
    late: 0,
    score: 'N/A'
  });

  // Debug logging for shifts and thresholds (kept small, visible in UI and console)
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const addDebug = (msg: string) => {
    // keep most recent 6 messages
    setDebugLog(prev => [msg, ...prev].slice(0, 6));
    // also print to console for developer inspection
    console.debug('[TrackGrip debug]', msg);
  };

  // Car positions for radar
  const [cars, setCars] = useState<Car[]>([
    { id: 1, angle: 0, distance: 0, isPlayer: true, color: '#a3e635', label: 'YOU' },
    { id: 2, angle: 350, distance: 0.4, isPlayer: false, color: '#06b6d4', label: 'P3' },
    { id: 3, angle: 10, distance: 0.6, isPlayer: false, color: '#d946ef', label: 'P5' },
    { id: 4, angle: 180, distance: 0.3, isPlayer: false, color: '#fbbf24', label: 'P6' },
    { id: 5, angle: 270, distance: 0.5, isPlayer: false, color: '#f87171', label: 'P8' },
  ]);

  // Get optimal gear for current speed
  const getOptimalGear = (speed: number): number => {
    // Fallback for speeds below first min
    if (speed < optimalGearMap[0].minSpeed) return 1;
    // Choose the highest gear whose range contains the speed (handles overlaps)
    let chosen = 1;
    for (const entry of optimalGearMap) {
      if (speed >= entry.minSpeed && speed <= entry.maxSpeed) {
        chosen = entry.gear; // later entries overwrite for overlaps
      }
    }
    // Clamp to 1..4 explicitly
    return Math.min(4, Math.max(1, chosen));
  };

  /**
   * Generate a Mechanical Sympathy style report from recent telemetry history.
   * Counts upshifts and classifies them as optimal / early / late using `optimalShiftRPM`.
   */
  const generateMechanicalSympathyReport = () => {
    const data = telemetryHistoryRef.current;
    let totalShifts = 0;
    let optimalShifts = 0;
    let earlyShifts = 0;
    let lateShifts = 0;

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      const gear = curr.gear;
      const prevGear = prev.gear;
      const prevRpm = prev.rpm;

      // Detect a simple upshift (prevGear -> gear)
      if (gear > prevGear && prevGear > 0 && (gear - prevGear === 1)) {
        totalShifts++;
        const shiftKey = `${prevGear}->${gear}` as keyof typeof optimalShiftRPM;
        const optimalRpm = (optimalShiftRPM as any)[shiftKey];

        if (optimalRpm) {
          const diff = prevRpm - optimalRpm;
          if (Math.abs(diff) <= SHIFT_TOLERANCE_RPM) optimalShifts++;
          else if (diff < -SHIFT_TOLERANCE_RPM) earlyShifts++; // shifted early (lower RPM)
          else if (diff > SHIFT_TOLERANCE_RPM) lateShifts++; // shifted late (higher RPM)
        }
      } else if (gear < prevGear && (prevGear - gear === 1)) {
        // Downshift event
        totalShifts++;
        if (prevRpm < DOWN_SHIFT_EARLY_MAX) earlyShifts++;
        else if (prevRpm > DOWN_SHIFT_LATE_MIN) lateShifts++;
        else optimalShifts++;
      }
    }

    let score = 'N/A';
    if (totalShifts > 0) {
      const optimalPct = (optimalShifts / totalShifts) * 100;
      if (optimalPct > 95) score = 'A+';
      else if (optimalPct > 90) score = 'A';
      else if (optimalPct > 85) score = 'B+';
      else if (optimalPct > 80) score = 'B';
      else if (optimalPct > 70) score = 'C';
      else if (optimalPct > 60) score = 'D';
      else score = 'F';
    }

    setSympathyReport({ total: totalShifts, optimal: optimalShifts, early: earlyShifts, late: lateShifts, score });
  };

  // Check for gear mismatch
  useEffect(() => {
    const interval = setInterval(() => {
      const optimalGear = getOptimalGear(currentSpeed);
      
      // Check gear mismatch
        if (currentGear !== optimalGear) {
        const alert: GearAlert = {
          type: 'gear-mismatch',
          message: `WRONG GEAR @ ${currentSpeed.toFixed(0)} kph | Current: ${currentGear} | Optimal: ${optimalGear}`,
            severity: 'warning',
          timestamp: Date.now()
        };
        
        setGearAlerts(prev => [alert, ...prev].slice(0, 3));
        addAlert(`Gear Mismatch: ${alert.message}`, 'gear');
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [currentSpeed, currentGear, currentRPM, addAlert]);

  // Removed simulation gear-step timer to rely solely on telemetry data

  // Playback telemetry
  useEffect(() => {
    if (telemetryData && telemetryData.length > 0) {
      let animationFrameId: number;
      
      const animate = () => {
        // Advance playback
        playbackIndexRef.current = (playbackIndexRef.current + 1) % telemetryData.length;
        const point = telemetryData[playbackIndexRef.current];

        if (point) {
          setCurrentSpeed(point.speed || 0);
          setCurrentRPM(point.rpm || 0);
          setCurrentGear(point.gear || 1);
          
          // Update chart data
          throttleDataRef.current.push(point.throttle || 0);
          brakeDataRef.current.push(point.brake || 0);
          if (throttleDataRef.current.length > 100) throttleDataRef.current.shift();
          if (brakeDataRef.current.length > 100) brakeDataRef.current.shift();
        }

        // Update weather if available (simplified: just take first point or match time)
        if (weatherData && weatherData.length > 0) {
           // In a real app, we'd binary search weatherData by timestamp
           const weatherPoint = weatherData[0]; 
           if (weatherPoint) {
             setAirTemp(weatherPoint.airTemp);
             setTrackTemp(weatherPoint.trackTemp);
           }
        }

        animationFrameId = requestAnimationFrame(animate);
      };

      animate();
      return () => cancelAnimationFrame(animationFrameId);
    }
  }, [addAlert, telemetryData, weatherData]);

  // Record telemetry history whenever the core telemetry values change, and refresh report
  useEffect(() => {
    telemetryHistoryRef.current.push({
      speed: currentSpeed,
      gear: currentGear,
      rpm: currentRPM,
      timestamp: Date.now()
    });

    // Keep bounded history (e.g., last ~5000 samples)
    if (telemetryHistoryRef.current.length > 5000) telemetryHistoryRef.current.shift();

    // Recompute sympathy report on each telemetry update
    generateMechanicalSympathyReport();
  }, [currentSpeed, currentGear, currentRPM]);

  const getGripColor = () => {
    if (gripLevel >= 90) return '#a3e635';
    if (gripLevel >= 75) return '#06b6d4';
    if (gripLevel >= 60) return '#fbbf24';
    return '#f87171';
  };

  // Fetch Grip Analysis from Backend
  useEffect(() => {
    const fetchGripAnalysis = async () => {
        if (!weatherData || weatherData.length === 0) return;
        
        const weather = weatherData[0];
        
        // Construct telemetry summary
        const telemetrySummary = {
            exit_speed: currentSpeed, 
            mean_pbrake_f: brakeDataRef.current.length > 0 ? brakeDataRef.current.reduce((a: number, b: number) => a + b, 0) / brakeDataRef.current.length : 0,
            aps_std: 0.1, 
            brake_point_shift_seconds: 0.0, 
            sector_id: 1 
        };

        try {
            const response = await fetch('http://localhost:8000/analyze-grip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    weather: {
                        TrackTemp_F: (weather.trackTemp * 9/5) + 32, 
                        Humidity_pct: 50, 
                        CloudCover_pct: 20,
                        WindSpeed_mph: 5,
                        ...weather 
                    },
                    telemetry: telemetrySummary
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.status === 'success') {
                    setGripLevel(result.data.grip_percent);
                    setGripConfidence(result.data.confidence);
                    setExpectedTimeDelta(result.data.expected_sector_time_change);
                }
            }
        } catch (e) {
            console.error("Grip analysis failed", e);
        }
    };

    const interval = setInterval(fetchGripAnalysis, 2000); 
    return () => clearInterval(interval);
  }, [weatherData, currentSpeed]);

  return (
    <div className="glass-card p-6 hover-glow-effect grain-overlay animate-fade-in" style={{ animationDelay: '0.4s' }}>
      <h3 className="text-xl mb-4 text-[#06b6d4] text-glow-cyan uppercase tracking-wider flex items-center gap-2">
        <Cloud className="w-5 h-5" />
        Track & Grip Analysis
      </h3>
      
      <div className="space-y-6">
        {/* Top Row: Temperature and Grip */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-black/40 rounded-lg p-3">
            <div className="text-xs text-[#a3a3a3] mb-1 uppercase tracking-wider flex items-center gap-1">
              <Thermometer className="w-3 h-3" />
              Air Temp
            </div>
            <div className="text-2xl text-white">{airTemp.toFixed(1)}°C</div>
          </div>
          
          <div className="bg-black/40 rounded-lg p-3">
            <div className="text-xs text-[#a3a3a3] mb-1 uppercase tracking-wider flex items-center gap-1">
              <Thermometer className="w-3 h-3" />
              Track Temp
            </div>
            <div className="text-2xl text-white">{trackTemp.toFixed(1)}°C</div>
          </div>

          <div className="bg-black/40 rounded-lg p-3">
            <div className="text-xs text-[#a3a3a3] mb-1 uppercase tracking-wider">Grip Level</div>
            <div 
              className="text-2xl"
              style={{ 
                color: getGripColor(),
                filter: `drop-shadow(0 0 10px ${getGripColor()})`
              }}
            >
              {gripLevel.toFixed(0)}%
            </div>
            {gripLevel > 100 && (
              <div className="text-[10px] text-[#a3e635] font-bold animate-pulse mt-1">
                SUPER-OPTIMAL
              </div>
            )}
            <div className="flex justify-between mt-2 text-[10px] text-gray-400 border-t border-white/5 pt-2">
                <span>Conf: {(gripConfidence * 100).toFixed(0)}%</span>
                <span className={expectedTimeDelta > 0 ? 'text-red-400' : 'text-green-400'}>
                    Δ: {expectedTimeDelta > 0 ? '+' : ''}{expectedTimeDelta.toFixed(2)}s
                </span>
            </div>
          </div>
        </div>

        {/* Weather Alert */}
        {weatherAlert && (
          <div className="p-3 rounded-lg bg-[#fbbf24]/20 border border-[#fbbf24]/50 text-[#fbbf24] text-sm animate-pulse">
            ⚠️ {weatherAlert}
          </div>
        )}

        {/* Combined Section: Live Telemetry & Gear Efficiency */}
        <div className="grid grid-cols-2 gap-4">
          {/* Live Telemetry Status */}
          <div className="bg-black/40 rounded-lg p-4 relative overflow-hidden h-full">
            {telemetryData && telemetryData.length > 0 && (
              <div className="absolute top-0 right-0 bg-[#a3e635] text-black text-[10px] font-bold px-2 py-1 rounded-bl-lg animate-pulse">
                LIVE DATA
              </div>
            )}
            <div className="text-xs text-[#d946ef] mb-3 uppercase tracking-wider flex items-center gap-1">
              <Gauge className="w-3 h-3" />
              Live Telemetry
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#a3a3a3]">SPEED</span>
                <span className="text-lg text-white">{currentSpeed.toFixed(0)} kph</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#a3a3a3]">GEAR</span>
                <span 
                  className="text-3xl"
                  style={{
                    color: currentGear === getOptimalGear(currentSpeed) ? '#a3e635' : '#f87171',
                    filter: `drop-shadow(0 0 10px ${currentGear === getOptimalGear(currentSpeed) ? '#a3e635' : '#f87171'})`
                  }}
                >
                  {currentGear}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#a3a3a3]">RPM</span>
                <span className="text-lg text-white">{currentRPM.toFixed(0)}</span>
              </div>
              {/* Debug panel - shows last shift/threshold decisions */}
              <div className="mt-2 p-2 bg-black/20 rounded text-xs text-[#a3a3a3] max-h-24 overflow-y-auto">
                <div className="font-medium text-white mb-1">Debug</div>
                {debugLog.length === 0 ? (
                  <div className="opacity-60 italic">No debug messages</div>
                ) : (
                  debugLog.map((m, i) => (
                    <div key={i} className="whitespace-pre-wrap">{m}</div>
                  ))
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#a3a3a3]">OPTIMAL</span>
                <span className="text-lg text-[#06b6d4]">Gear {getOptimalGear(currentSpeed)}</span>
              </div>
            </div>
          </div>

          {/* Gear Efficiency Alerts */}
          <div className="bg-black/40 rounded-lg p-4 h-full">
            <div className="text-xs text-[#fbbf24] mb-3 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Gear Efficiency Analyzer
            </div>
            {/* Mechanical Sympathy Report Summary */}
            <div className="grid grid-cols-5 gap-3 mb-3 text-sm">
              <div className="text-xs text-[#a3a3a3]">Shifts</div>
              <div className="font-medium text-white">{sympathyReport.total}</div>

              <div className="text-xs text-[#a3a3a3]">Optimal</div>
              <div className="font-medium text-[#a3e635]">{sympathyReport.optimal}</div>

              <div className="text-xs text-[#a3a3a3]">Early</div>
              <div className="font-medium text-[#fbbf24]">{sympathyReport.early}</div>

              <div className="text-xs text-[#a3a3a3]">Late</div>
              <div className="font-medium text-[#f87171]">{sympathyReport.late}</div>

              <div className="text-xs text-[#a3a3a3]">Score</div>
              <div className="font-medium text-white col-span-4">{sympathyReport.score}</div>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
              {gearAlerts.length === 0 ? (
                <div className="text-xs text-[#a3a3a3] italic">No alerts - Optimal gearing</div>
              ) : (
                gearAlerts.map((alert, idx) => (
                  <div
                    key={`${alert.timestamp}-${idx}`}
                    className={`p-2 rounded-lg text-xs border ${
                      alert.severity === 'critical'
                        ? 'bg-[#f87171]/20 border-[#f87171]/50 text-[#f87171]'
                        : 'bg-[#fbbf24]/20 border-[#fbbf24]/50 text-[#fbbf24]'
                    }`}
                  >
                    <div className="uppercase tracking-wider mb-1">
                      {alert.type === 'gear-mismatch' ? '⚠️ GEAR MISMATCH' : '⚡ SHIFT TIMING'}
                    </div>
                    <div className="opacity-90">{alert.message}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}