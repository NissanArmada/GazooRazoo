import { useEffect, useState, useRef } from 'react';
import { Sword, Shield, Zap, Timer, Gauge } from 'lucide-react';

interface OvertakeDefenseProps {
  addAlert: (message: string, type: string) => void;
  telemetryData?: any[];
}

export default function OvertakeDefense({ addAlert, telemetryData }: OvertakeDefenseProps) {
  const [offenseAnalysis, setOffenseAnalysis] = useState('Waiting for telemetry...');
  const [offensePrediction, setOffensePrediction] = useState(0);
  const [defenseThreat, setDefenseThreat] = useState('N/A');
  
  // Virtual Target Car State
  const [targetGap, setTargetGap] = useState(1.2);
  const [speedDiff, setSpeedDiff] = useState(0);
  const [drsAvailable, setDrsAvailable] = useState(false);
  
  const lastUpdateRef = useRef(Date.now());

  // Simulate interaction with a virtual car ahead
  useEffect(() => {
    if (!telemetryData || telemetryData.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const dt = (now - lastUpdateRef.current) / 1000; // seconds
      lastUpdateRef.current = now;

      // Get current player speed (or 0)
      // We use the last point in the telemetry array as "current"
      // In a real app, we'd sync this with the playback index from other components, 
      // but here we'll just take the latest available point or a random one if it's a full dataset
      // Assuming telemetryData is the full lap, we need to know "where" we are.
      // For this demo, let's just pick a point or assume the parent passes the *current* point.
      // Actually, TrackGrip handles playback. App.tsx passes the full array.
      // We'll just pick a random point to simulate "live" if we don't have a playback index,
      // OR better: we just oscillate the values to show the model working since we don't have a synchronized playback clock here.
      
      // Let's simulate a dynamic scenario:
      // We are chasing a car.
      
      setTargetGap(prev => {
        // Random walk for gap
        const change = (Math.random() - 0.5) * 0.1;
        let newGap = prev + change;
        if (newGap < 0.1) newGap = 0.1;
        if (newGap > 2.5) newGap = 2.5;
        return newGap;
      });

      setSpeedDiff(prev => {
        // Random walk for speed diff (-10 to +10 kph)
        const change = (Math.random() - 0.5) * 2;
        let newDiff = prev + change;
        if (newDiff < -15) newDiff = -15;
        if (newDiff > 15) newDiff = 15;
        return newDiff;
      });

    }, 1000);

    return () => clearInterval(interval);
  }, [telemetryData]);

  // Poll API for prediction
  useEffect(() => {
    const fetchPrediction = async () => {
      try {
        const response = await fetch('http://localhost:8000/predict-overtake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gap: targetGap,
            time_diff: targetGap, // Approximation
            speed_diff: speedDiff
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success') {
            setOffensePrediction(data.probability);
            setDrsAvailable(data.drs);
            
            // Update analysis text
            if (data.probability > 80) setOffenseAnalysis('OVERTAKE WINDOW OPEN');
            else if (data.probability > 50) setOffenseAnalysis('PREPARE FOR ATTACK');
            else setOffenseAnalysis('CLOSE THE GAP');
            
            // Update defense threat (inverse logic for demo)
            if (targetGap < 0.5) setDefenseThreat('CRITICAL');
            else if (targetGap < 1.0) setDefenseThreat('HIGH');
            else setDefenseThreat('LOW');
          }
        }
      } catch (e) {
        console.error("Overtake prediction failed", e);
      }
    };

    const interval = setInterval(fetchPrediction, 1000);
    return () => clearInterval(interval);
  }, [targetGap, speedDiff]);

  const getPredictionColor = () => {
    if (offensePrediction >= 75) return '#a3e635';
    if (offensePrediction >= 50) return '#06b6d4';
    return '#fbbf24';
  };

  const getThreatColor = () => {
    if (defenseThreat === 'CRITICAL') return '#f87171';
    if (defenseThreat === 'HIGH') return '#fbbf24';
    if (defenseThreat === 'MEDIUM') return '#06b6d4';
    return '#a3e635';
  };

  return (
    <div className="glass-card p-6 hover-glow-effect grain-overlay animate-fade-in">
      <h3 className="text-xl mb-4 text-[#06b6d4] text-glow-cyan uppercase tracking-wider flex items-center gap-2">
        <Sword className="w-5 h-5" />
        Battle Strategy
      </h3>
      
      <div className="space-y-4">
        {/* Offense Analysis */}
        <div className="bg-black/40 rounded-lg p-4 border border-[#a3e635]/30">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <div className="text-xs text-[#a3a3a3] uppercase tracking-wider">Target Status</div>
            </div>
            {drsAvailable && (
              <div className="bg-[#a3e635] text-black text-[10px] font-bold px-2 py-0.5 rounded animate-pulse">
                DRS ACTIVE
              </div>
            )}
          </div>

          {/* Live Inputs Display */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-black/40 p-2 rounded border border-white/5">
              <div className="text-[10px] text-[#a3a3a3] flex items-center gap-1">
                <Timer className="w-3 h-3" /> GAP
              </div>
              <div className="text-lg text-white font-mono">{targetGap.toFixed(2)}s</div>
            </div>
            <div className="bg-black/40 p-2 rounded border border-white/5">
              <div className="text-[10px] text-[#a3a3a3] flex items-center gap-1">
                <Gauge className="w-3 h-3" /> Δ SPEED
              </div>
              <div className={`text-lg font-mono ${speedDiff > 0 ? 'text-[#a3e635]' : 'text-[#f87171]'}`}>
                {speedDiff > 0 ? '+' : ''}{speedDiff.toFixed(1)}
              </div>
            </div>
          </div>

          <div id="offenseAnalysis" className={`text-sm font-bold mb-3 tracking-wide ${
            offensePrediction > 70 ? 'text-[#a3e635]' : 'text-white'
          }`}>
            {offenseAnalysis}
          </div>
          
          <div id="offensePrediction" className="bg-black/60 rounded-lg p-3 border border-white/10">
            <div className="text-xs text-[#a3a3a3] mb-2 uppercase tracking-wider">Success Probability</div>
            <div className="flex items-center gap-3">
              <div 
                className="text-2xl"
                style={{ 
                  color: getPredictionColor(),
                  filter: `drop-shadow(0 0 10px ${getPredictionColor()})`
                }}
              >
                {offensePrediction}%
              </div>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${offensePrediction}%`,
                    backgroundColor: getPredictionColor(),
                    boxShadow: `0 0 10px ${getPredictionColor()}`
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Defense Threat */}
        <div className="bg-black/40 rounded-lg p-4 border border-[#d946ef]/30">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-[#d946ef]" style={{ filter: 'drop-shadow(0 0 5px rgba(217, 70, 239, 0.5))' }} />
            <div className="text-xs text-[#a3a3a3] uppercase tracking-wider">Defense Status</div>
          </div>
          
          <div 
            id="defenseThreat" 
            className="text-center py-4 rounded-lg border-2 transition-all duration-300"
            style={{ 
              borderColor: getThreatColor(),
              backgroundColor: `${getThreatColor()}20`,
              color: getThreatColor(),
              filter: `drop-shadow(0 0 15px ${getThreatColor()})`
            }}
          >
            <div className="text-2xl">
              {defenseThreat}
            </div>
            <div className="text-xs mt-1 opacity-70">THREAT LEVEL</div>
          </div>
        </div>
      </div>
    </div>
  );
}
