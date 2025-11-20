import { useEffect, useState, useRef } from 'react';
import { Cloud, Thermometer, Gauge, AlertTriangle, TrendingUp } from 'lucide-react';

interface TrackGripProps {
  addAlert: (message: string, type: string) => void;
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

export default function TrackGrip({ addAlert }: TrackGripProps) {
  const [airTemp, setAirTemp] = useState(22);
  const [trackTemp, setTrackTemp] = useState(35);
  const [gripLevel, setGripLevel] = useState(95);
  const [weatherAlert, setWeatherAlert] = useState('');
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const throttleCanvasRef = useRef<HTMLCanvasElement>(null);
  const brakeCanvasRef = useRef<HTMLCanvasElement>(null);
  const throttleDataRef = useRef<number[]>([]);
  const brakeDataRef = useRef<number[]>([]);
  
  // Telemetry data for gear efficiency
  const [currentSpeed, setCurrentSpeed] = useState(145);
  const [currentGear, setCurrentGear] = useState(4);
  const [currentRPM, setCurrentRPM] = useState(7200);
  const [gearAlerts, setGearAlerts] = useState<GearAlert[]>([]);
  
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
      
        // No automatic RPM-driven gear changes here. Gear is controlled by the dedicated 5s timer
        // Keep mismatch checks and other alerts only (no setCurrentGear calls in this effect).
    }, 3000);

    return () => clearInterval(interval);
  }, [currentSpeed, currentGear, currentRPM, addAlert]);

  // Dedicated gear-step timer: every 5s move gear by +/-1, capped to [1,4]
  useEffect(() => {
    const id = setInterval(() => {
      setCurrentGear(prev => {
        let next = prev;
        if (prev <= 1) {
          next = 2; // force up when at 1
        } else if (prev >= 4) {
          next = 3; // force down when at 4
        } else {
          // random up/down by 1
          next = prev + (Math.random() < 0.5 ? -1 : 1);
        }
        // clamp
        next = Math.max(1, Math.min(4, next));

        // Detect and alert on bad downshifts
        if (next < prev) {
          if (currentRPM < DOWN_SHIFT_EARLY_MAX || currentRPM > DOWN_SHIFT_LATE_MIN) {
            const isEarly = currentRPM < DOWN_SHIFT_EARLY_MAX;
            const alert: GearAlert = {
              type: 'shift-point',
              message: `DOWNSHIFT ${isEarly ? 'EARLY' : 'LATE'} (${prev}->${next}) | ${currentRPM.toFixed(0)} RPM`,
              severity: isEarly ? 'warning' : 'critical',
              timestamp: Date.now()
            };
            setGearAlerts(p => [alert, ...p].slice(0, 3));
            addAlert(`Shift Point: ${alert.message}`, 'gear');
          }
        }

        addDebug(`Gear timer: ${prev} -> ${next}`);

        // Add a small chart perturbation to visualize change
        throttleDataRef.current.push(Math.max(0, Math.min(1, 0.5 + (Math.random() - 0.5) * 0.5)));
        brakeDataRef.current.push(Math.max(0, Math.min(1, 0.3 + (Math.random() - 0.5) * 0.4)));
        if (throttleDataRef.current.length > 100) throttleDataRef.current.shift();
        if (brakeDataRef.current.length > 100) brakeDataRef.current.shift();

        return next;
      });
    }, 5000);

    return () => clearInterval(id);
  }, []);

  // Simulate telemetry updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSpeed(prev => Math.max(60, Math.min(280, prev + (Math.random() - 0.5) * 30)));
      setCurrentRPM(prev => Math.max(3000, Math.min(8500, prev + (Math.random() - 0.5) * 800)));
      
      // Temperature changes
      setAirTemp(prev => Math.max(15, Math.min(30, prev + (Math.random() - 0.5) * 0.5)));
      setTrackTemp(prev => Math.max(25, Math.min(50, prev + (Math.random() - 0.5) * 1)));
      setGripLevel(prev => Math.max(60, Math.min(100, prev + (Math.random() - 0.5) * 2)));

      // Random grip warnings
      if (Math.random() < 0.03) {
        setWeatherAlert('GRIP REDUCED IN SECTOR 2');
        addAlert('Track & Grip: Grip reduced in Sector 2', 'weather');
        setTimeout(() => setWeatherAlert(''), 6000);
      }
      
      // Update car positions on radar
      setCars(prev => prev.map(car => {
        if (car.isPlayer) return car;
        
        return {
          ...car,
          angle: (car.angle + (Math.random() - 0.5) * 15 + 360) % 360,
          distance: Math.max(0.2, Math.min(0.9, car.distance + (Math.random() - 0.5) * 0.1))
        };
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, [addAlert]);

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

  // Draw brake and throttle charts
  useEffect(() => {
    const drawLiveChart = (
      canvas: HTMLCanvasElement,
      data: number[],
      color: string,
      label: string
    ) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const leftMargin = 50;
      const rightMargin = 20;
      const topMargin = 25;
      const bottomMargin = 20;
      const chartWidth = width - leftMargin - rightMargin;
      const chartHeight = height - topMargin - bottomMargin;

      ctx.clearRect(0, 0, width, height);

      // Draw label at top
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '12px Inter';
      ctx.textAlign = 'left';
      ctx.fillText(label, leftMargin, 15);

      // Draw grid and Y-axis
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px Inter';
      ctx.textAlign = 'right';
      
      for (let i = 0; i <= 5; i++) {
        const y = topMargin + (chartHeight / 5) * i;
        const value = 100 - (i * 20); // 100%, 80%, 60%, 40%, 20%, 0%
        
        // Draw grid line
        ctx.beginPath();
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(width - rightMargin, y);
        ctx.stroke();
        
        // Draw Y-axis tick
        ctx.beginPath();
        ctx.moveTo(leftMargin - 5, y);
        ctx.lineTo(leftMargin, y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        
        // Draw Y-axis label
        ctx.fillText(`${value}%`, leftMargin - 8, y + 3);
      }

      // Draw time axis labels
      ctx.textAlign = 'center';
      ctx.fillText('TIME →', width - rightMargin - 30, height - 5);

      // Draw data line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const pointSpacing = chartWidth / Math.max(data.length, 100);
      
      data.forEach((value, i) => {
        const x = leftMargin + (i * pointSpacing);
        const y = topMargin + chartHeight - (value * chartHeight);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();

      // Draw glow effect
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw current value indicator and label
      if (data.length > 0) {
        const lastValue = data[data.length - 1];
        const y = topMargin + chartHeight - (lastValue * chartHeight);
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(width - rightMargin - 5, y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw current value text
        ctx.textAlign = 'left';
        ctx.fillStyle = color;
        ctx.font = 'bold 11px Inter';
        ctx.fillText(`${Math.round(lastValue * 100)}%`, width - rightMargin + 5, y + 4);
      }
    };

    const animate = () => {
      // Simulate live data streaming
      const newThrottle = Math.max(0, Math.min(1, 
        Math.sin(Date.now() / 500) * 0.4 + 0.5 + (Math.random() - 0.5) * 0.1
      ));
      const newBrake = Math.max(0, Math.min(1,
        Math.cos(Date.now() / 700) * 0.3 + 0.3 + (Math.random() - 0.5) * 0.1
      ));

      throttleDataRef.current.push(newThrottle);
      brakeDataRef.current.push(newBrake);

      // Keep only last 100 points
      if (throttleDataRef.current.length > 100) {
        throttleDataRef.current.shift();
      }
      if (brakeDataRef.current.length > 100) {
        brakeDataRef.current.shift();
      }

      // Draw charts
      if (throttleCanvasRef.current) {
        drawLiveChart(
          throttleCanvasRef.current,
          throttleDataRef.current,
          '#a3e635',
          'THROTTLE (APS)'
        );
      }
      if (brakeCanvasRef.current) {
        drawLiveChart(
          brakeCanvasRef.current,
          brakeDataRef.current,
          '#06b6d4',
          'BRAKE PRESSURE (F)'
        );
      }
    };

    const interval = setInterval(animate, 50);

    return () => clearInterval(interval);
  }, []);

  // Draw radar
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Guard against invalid canvas dimensions
    if (width <= 0 || height <= 0) return;
    
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - 10;
    
    // Guard against negative radius
    if (maxRadius <= 0) return;

    ctx.clearRect(0, 0, width, height);

    // Draw radar circles
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (maxRadius / 3) * i, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw radar cross
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - maxRadius);
    ctx.lineTo(centerX, centerY + maxRadius);
    ctx.moveTo(centerX - maxRadius, centerY);
    ctx.lineTo(centerX + maxRadius, centerY);
    ctx.stroke();

    // Draw scanning line (rotating)
    const scanAngle = (Date.now() / 30) % 360;
    const scanRad = (scanAngle * Math.PI) / 180;
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(scanRad - Math.PI / 2) * maxRadius,
      centerY + Math.sin(scanRad - Math.PI / 2) * maxRadius
    );
    ctx.stroke();

    // Draw gradient fade for scan line
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.1)');
    gradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.05)');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, maxRadius, scanRad - Math.PI / 2 - 0.3, scanRad - Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    // Draw cars
    cars.forEach(car => {
      const carRad = (car.angle * Math.PI) / 180;
      const carDist = car.distance * maxRadius;
      const carX = centerX + Math.cos(carRad - Math.PI / 2) * carDist;
      const carY = centerY + Math.sin(carRad - Math.PI / 2) * carDist;

      // Draw car dot
      ctx.fillStyle = car.color;
      ctx.shadowColor = car.color;
      ctx.shadowBlur = car.isPlayer ? 15 : 10;
      ctx.beginPath();
      ctx.arc(carX, carY, car.isPlayer ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw label
      ctx.fillStyle = car.color;
      ctx.font = 'bold 9px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(car.label, carX, carY - 10);
    });

    // Draw center dot
    ctx.fillStyle = '#a3e635';
    ctx.shadowColor = '#a3e635';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw compass labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('N', centerX, centerY - maxRadius - 5);
    ctx.fillText('S', centerX, centerY + maxRadius + 12);
    ctx.textAlign = 'left';
    ctx.fillText('E', centerX + maxRadius + 5, centerY + 4);
    ctx.textAlign = 'right';
    ctx.fillText('W', centerX - maxRadius - 5, centerY + 4);

    const animationFrame = requestAnimationFrame(() => {});
    return () => cancelAnimationFrame(animationFrame);
  });

  useEffect(() => {
    const handleResize = () => {
      if (radarCanvasRef.current) {
        const rect = radarCanvasRef.current.getBoundingClientRect();
        radarCanvasRef.current.width = rect.width;
        radarCanvasRef.current.height = rect.height;
      }
      if (throttleCanvasRef.current) {
        const rect = throttleCanvasRef.current.getBoundingClientRect();
        throttleCanvasRef.current.width = rect.width;
        throttleCanvasRef.current.height = rect.height;
      }
      if (brakeCanvasRef.current) {
        const rect = brakeCanvasRef.current.getBoundingClientRect();
        brakeCanvasRef.current.width = rect.width;
        brakeCanvasRef.current.height = rect.height;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getGripColor = () => {
    if (gripLevel >= 90) return '#a3e635';
    if (gripLevel >= 75) return '#06b6d4';
    if (gripLevel >= 60) return '#fbbf24';
    return '#f87171';
  };

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
          </div>
        </div>

        {/* Weather Alert */}
        {weatherAlert && (
          <div className="p-3 rounded-lg bg-[#fbbf24]/20 border border-[#fbbf24]/50 text-[#fbbf24] text-sm animate-pulse">
            ⚠️ {weatherAlert}
          </div>
        )}

        {/* Middle Section: Live Telemetry and Charts */}
        <div className="grid grid-cols-3 gap-4">
          {/* Live Telemetry Status */}
          <div className="bg-black/40 rounded-lg p-4">
            <div className="text-xs text-[#d946ef] mb-3 uppercase tracking-wider flex items-center gap-1">
              <Gauge className="w-3 h-3" />
              Live Telemetry
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#a3a3a3]\">SPEED</span>
                <span className="text-lg text-white">{currentSpeed.toFixed(0)} kph</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#a3a3a3]\">GEAR</span>
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
                <span className="text-xs text-[#a3a3a3]\">RPM</span>
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
                <span className="text-xs text-[#a3a3a3]\">OPTIMAL</span>
                <span className="text-lg text-[#06b6d4]\">Gear {getOptimalGear(currentSpeed)}</span>
              </div>
            </div>
          </div>

          {/* Throttle Chart */}
          <div className="bg-black/40 rounded-lg p-3">
            <canvas
              ref={throttleCanvasRef}
              className="w-full h-full rounded-lg bg-black/60"
            />
          </div>

          {/* Brake Chart */}
          <div className="bg-black/40 rounded-lg p-3">
            <canvas
              ref={brakeCanvasRef}
              className="w-full h-full rounded-lg bg-black/60"
            />
          </div>
        </div>

        {/* Bottom Section: Radar and Gear Alerts */}
        <div className="grid grid-cols-3 gap-4">
          {/* Minimap Radar - Bottom Left */}
          <div className="bg-black/40 rounded-lg p-4">
            <div className="text-xs text-[#06b6d4] mb-2 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Position Radar
            </div>
            <canvas
              ref={radarCanvasRef}
              className="w-full aspect-square rounded-lg bg-black/60"
            />
          </div>

          {/* Gear Efficiency Alerts - Span 2 columns */}
          <div className="col-span-2 bg-black/40 rounded-lg p-4">
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