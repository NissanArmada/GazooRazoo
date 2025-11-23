import { useEffect, useRef, useState } from 'react';

interface DriverDNAProps {
  addAlert: (message: string, type: string) => void;
  telemetryData?: any[];
  lapsData?: any[];
  sectionsData?: any[];
  driverName?: string;
}

export default function DriverDNA({ addAlert, telemetryData, lapsData, sectionsData, driverName }: DriverDNAProps) {
  const brakeCanvasRef = useRef<HTMLCanvasElement>(null);
  const throttleCanvasRef = useRef<HTMLCanvasElement>(null);
  const [dnaAlert, setDnaAlert] = useState('');
  const playbackIndexRef = useRef(0);
  const [driverStyle, setDriverStyle] = useState({ brake: '', throttle: '' });
  const [baselineDNA, setBaselineDNA] = useState<{ brakeProfile: number[], throttleProfile: number[] } | null>(null);
  
  // Debug/Status State
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  // Default path - editable by user for testing
  const [dataBasePath, setDataBasePath] = useState("D:/GR Cupo/GazooRazoo/VIR/Race 1");

  // Fetch Baseline DNA from Python API
  useEffect(() => {
    if (!driverName || !telemetryData || telemetryData.length === 0) return;

    const fetchDNA = async () => {
      setStatus('loading');
      setErrorMessage('');
      try {
        // Construct file paths based on the base path
        // Note: This assumes standard naming. If files are named differently, this will fail.
        // In a real app, we'd need a more robust way to map selections to file paths.
        const tPath = `${dataBasePath}/R1_vir_telemetry_data.csv`; // Defaulting to VIR naming
        const lPath = `${dataBasePath}/vir_lap_time_R1.csv`;

        // If the user is testing Barber, they might need to change the filenames too.
        // For this "check if working" step, we'll just try to hit the API.
        
        console.log(`Fetching DNA for ${driverName} from ${dataBasePath}...`);

        const response = await fetch('http://localhost:8000/analyze-dna', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telemetryPath: tPath,
            lapsPath: lPath,
            driverId: `GR86-XXX-${driverName}`, 
            driverNumber: parseInt(driverName?.replace(/\D/g, '') || '0')
          })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log("DNA Analysis Result:", data);
        if (data.debugLog) {
            console.log("--- SERVER DEBUG LOG ---");
            console.log(data.debugLog);
            console.log("------------------------");
        }

        if (data.status === 'success' && data.dna) {
          setBaselineDNA({
            brakeProfile: data.dna.brake_signature,
            throttleProfile: data.dna.throttle_signature
          });
          setDriverStyle({
            brake: data.style.style_label.split(' / ')[0] || 'Unknown',
            throttle: data.style.style_label.split(' / ')[1] || 'Unknown'
          });
          setStatus('success');
        } else {
            setErrorMessage(data.message || "No DNA data returned");
            setStatus('error');
        }
      } catch (err) {
        console.error("Failed to fetch DNA analysis:", err);
        setErrorMessage(err instanceof Error ? err.message : "Connection Failed");
        setStatus('error');
      }
    };

    fetchDNA();
  }, [driverName, dataBasePath]); // Re-run if path changes

  useEffect(() => {
    const drawChart = (
      canvas: HTMLCanvasElement, 
      color: string, 
      type: 'brake' | 'throttle', 
      dataBuffer: number[],
      baselineProfile: number[] | undefined
    ) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const leftMargin = 40;
      const rightMargin = 10;
      const topMargin = 10;
      const bottomMargin = 10;
      const chartWidth = width - leftMargin - rightMargin;
      const chartHeight = height - topMargin - bottomMargin;

      ctx.clearRect(0, 0, width, height);

      // Draw grid and Y-axis labels
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px Inter';
      ctx.textAlign = 'right';
      
      for (let i = 0; i <= 4; i++) {
        const y = topMargin + (chartHeight / 4) * i;
        const value = 100 - (i * 25); // 100%, 75%, 50%, 25%, 0%
        
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

      // Draw Baseline DNA (if available)
      if (baselineProfile && baselineProfile.length > 0) {
        ctx.strokeStyle = `${color}40`; // Low opacity
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]); // Dashed line for baseline
        ctx.beginPath();
        
        const step = chartWidth / (baselineProfile.length - 1);
        
        baselineProfile.forEach((val, idx) => {
          // Normalize value (assuming 0-100 input, but check bounds)
          const normalizedVal = Math.min(Math.max(val, 0), 100) / 100;
          const x = leftMargin + idx * step;
          const y = topMargin + chartHeight - normalizedVal * chartHeight;
          
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash
      }

      // Draw current trace from dataBuffer
      if (dataBuffer.length > 0) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const step = chartWidth / Math.max(dataBuffer.length - 1, 1);
        
        dataBuffer.forEach((val, idx) => {
            const normalizedVal = Math.min(Math.max(val, 0), 100) / 100;
            const x = leftMargin + idx * step;
            const y = topMargin + chartHeight - normalizedVal * chartHeight;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    };

    let animationFrameId: number;
    
    // Event Latching State
    // We use this to capture "events" (braking zones / throttle applications)
    // and hold them on screen for analysis until the next one starts.
    const brakeState = {
      active: false,
      current: [] as number[],
      last: [] as number[]
    };
    const throttleState = {
      active: false,
      current: [] as number[],
      last: [] as number[]
    };

    const analyzeFatigue = (currentData: number[], baselineData: number[], type: 'brake' | 'throttle') => {
        if (!baselineData || baselineData.length === 0 || currentData.length === 0) return;

        const currentMax = Math.max(...currentData);
        const baselineMax = Math.max(...baselineData);
        
        // Fatigue Heuristic:
        // If the driver is consistently hitting < 85% of their optimal peak pressure/throttle,
        // it suggests tired legs (brake) or lack of commitment (throttle).
        const threshold = 0.85; 

        if (currentMax < baselineMax * threshold) {
            const drop = Math.round((1 - currentMax / baselineMax) * 100);
            setDnaAlert(`FATIGUE DETECTED: ${type} peak dropped by ${drop}% vs Optimal`);
            // Clear alert after 4 seconds
            setTimeout(() => setDnaAlert(''), 4000);
        }
    };

    const animate = () => {
      if (telemetryData && telemetryData.length > 0) {
         // Playback mode
         playbackIndexRef.current = (playbackIndexRef.current + 1) % telemetryData.length;
         const point = telemetryData[playbackIndexRef.current];
         
         if (point) {
             const tVal = (point.throttle || 0) * 100;
             const bVal = (point.brake || 0) * 100;

             // --- Brake Logic ---
             if (bVal > 5) {
                 if (!brakeState.active) {
                     brakeState.active = true;
                     brakeState.current = [];
                 }
                 brakeState.current.push(bVal);
             } else {
                 if (brakeState.active) {
                     brakeState.active = false;
                     // Only save if it was a significant event (> 5 frames)
                     if (brakeState.current.length > 5) {
                         brakeState.last = [...brakeState.current];
                         // Trigger Fatigue Analysis on Event Completion
                         if (baselineDNA?.brakeProfile) {
                             analyzeFatigue(brakeState.last, baselineDNA.brakeProfile, 'brake');
                         }
                     }
                 }
             }

             // --- Throttle Logic ---
             if (tVal > 5) {
                 if (!throttleState.active) {
                     throttleState.active = true;
                     throttleState.current = [];
                 }
                 throttleState.current.push(tVal);
             } else {
                 if (throttleState.active) {
                     throttleState.active = false;
                     if (throttleState.current.length > 5) {
                         throttleState.last = [...throttleState.current];
                         // Trigger Fatigue Analysis on Event Completion
                         if (baselineDNA?.throttleProfile) {
                             analyzeFatigue(throttleState.last, baselineDNA.throttleProfile, 'throttle');
                         }
                     }
                 }
             }
         }
      }

      // Determine data to draw: Active event or Last completed event
      const brakeData = brakeState.active ? brakeState.current : brakeState.last;
      const throttleData = throttleState.active ? throttleState.current : throttleState.last;

      if (brakeCanvasRef.current) {
        drawChart(
          brakeCanvasRef.current, 
          '#06b6d4', 
          'brake', 
          brakeData, 
          baselineDNA?.brakeProfile
        );
      }
      if (throttleCanvasRef.current) {
        drawChart(
          throttleCanvasRef.current, 
          '#a3e635', 
          'throttle', 
          throttleData, 
          baselineDNA?.throttleProfile
        );
      }
      
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => cancelAnimationFrame(animationFrameId);
  }, [addAlert, telemetryData, baselineDNA]);

  useEffect(() => {
    const handleResize = () => {
      if (brakeCanvasRef.current) {
        const rect = brakeCanvasRef.current.getBoundingClientRect();
        brakeCanvasRef.current.width = rect.width;
        brakeCanvasRef.current.height = rect.height;
      }
      if (throttleCanvasRef.current) {
        const rect = throttleCanvasRef.current.getBoundingClientRect();
        throttleCanvasRef.current.width = rect.width;
        throttleCanvasRef.current.height = rect.height;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="glass-card p-6 hover-glow-effect grain-overlay animate-fade-in relative overflow-hidden">
      {telemetryData && telemetryData.length > 0 && (
        <div className="absolute top-0 right-0 bg-[#a3e635] text-black text-[10px] font-bold px-2 py-1 rounded-bl-lg animate-pulse">
          LIVE DATA
        </div>
      )}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl text-[#d946ef] text-glow-magenta uppercase tracking-wider">
            Driver DNA
          </h3>
          {/* Debug Status Indicator */}
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2 h-2 rounded-full ${
              status === 'success' ? 'bg-green-500' : 
              status === 'error' ? 'bg-red-500' : 
              status === 'loading' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'
            }`} />
            <span className="text-[10px] text-gray-400 uppercase">
              {status === 'idle' ? 'Ready' : status}
            </span>
          </div>
        </div>

        {driverStyle.brake && (
          <div className="text-right">
            <div className="text-[10px] text-gray-400 uppercase">Style Analysis</div>
            <div className="text-xs font-bold text-white">
              {driverStyle.brake} / {driverStyle.throttle}
            </div>
          </div>
        )}
      </div>

      {/* Debug / Configuration Panel */}
      <div className="mb-4 p-2 bg-black/20 rounded border border-white/5">
        <div className="text-[10px] text-gray-500 mb-1 uppercase">Data Source Path (Server)</div>
        <input 
          type="text" 
          value={dataBasePath}
          onChange={(e) => setDataBasePath(e.target.value)}
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-[#d946ef]"
        />
        {status === 'error' && (
          <div className="mt-1 text-[10px] text-red-400">
            {errorMessage}
          </div>
        )}
        
        {/* Progress Bar */}
        {status === 'loading' && (
          <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden mt-2">
            <div className="h-full bg-[#d946ef] w-1/2 animate-[slide_1s_ease-in-out_infinite]" style={{
              animation: 'slide 1.5s ease-in-out infinite'
            }} />
            <style>{`
              @keyframes slide {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(200%); }
              }
            `}</style>
          </div>
        )}
      </div>
      
      <div className="space-y-4">
        {/* Brake Chart */}
        <div className="dna-chart-container">
          <div className="flex justify-between mb-2">
            <div className="text-xs text-[#a3a3a3] uppercase tracking-wider">Brake Pressure</div>
            <div className="text-[10px] text-[#06b6d4]">
              {baselineDNA ? '--- Optimal (Fastest Lap)' : ''}
            </div>
          </div>
          <canvas
            ref={brakeCanvasRef}
            className="w-full h-24 rounded-lg bg-black/40"
          />
        </div>

        {/* Throttle Chart */}
        <div className="dna-chart-container">
          <div className="flex justify-between mb-2">
            <div className="text-xs text-[#a3a3a3] uppercase tracking-wider">Throttle Application</div>
            <div className="text-[10px] text-[#a3e635]">
              {baselineDNA ? '--- Optimal (Fastest Lap)' : ''}
            </div>
          </div>
          <canvas
            ref={throttleCanvasRef}
            className="w-full h-24 rounded-lg bg-black/40"
          />
        </div>

        {/* Alert Box */}
        {dnaAlert && (
          <div id="dnaAlertBox" className="p-3 rounded-lg bg-[#f87171]/20 border border-[#f87171]/50 text-[#f87171] text-sm animate-pulse">
            {dnaAlert}
          </div>
        )}
      </div>
    </div>
  );
}
