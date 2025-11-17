import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface TopBarProps {
  fcyActive: boolean;
}

export default function TopBar({ fcyActive }: TopBarProps) {
  const [lapNumber, setLapNumber] = useState(1);
  const [raceTime, setRaceTime] = useState('00:00:00');
  const [ghostDelta, setGhostDelta] = useState(0);
  const [guardianDelta, setGuardianDelta] = useState(0);
  const [gapAhead, setGapAhead] = useState(2.456);
  const [gapBehind, setGapBehind] = useState(1.823);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      // Update race time
      const elapsed = Date.now() - startTime;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      setRaceTime(
        `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
      );

      // Update deltas with some variation
      setGhostDelta(prev => prev + (Math.random() - 0.5) * 0.02);
      setGuardianDelta(prev => prev + (Math.random() - 0.5) * 0.03);
      
      // Update gaps
      setGapAhead(prev => Math.max(0.1, prev + (Math.random() - 0.5) * 0.05));
      setGapBehind(prev => Math.max(0.1, prev + (Math.random() - 0.5) * 0.05));
      
      // Increment lap every 90 seconds
      if (seconds % 90 === 0 && seconds > 0) {
        setLapNumber(prev => prev + 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const formatDelta = (delta: number) => {
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta.toFixed(3)}`;
  };

  const formatGap = (gap: number) => {
    return `${gap.toFixed(3)}s`;
  };

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 glass-card transition-all duration-500 ${fcyActive ? 'fcy-active' : ''}`}
      style={{ borderRadius: 0 }}
    >
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-6 flex-wrap lg:flex-nowrap">
          {/* Left: Vitals */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#06b6d4]" style={{ filter: 'drop-shadow(0 0 10px rgba(6, 182, 212, 0.5))' }} />
              <div>
                <div className="text-xs text-[#a3a3a3] uppercase tracking-wider">Lap</div>
                <div id="lapCounter" className="text-xl text-white text-glow-cyan">{lapNumber}</div>
              </div>
            </div>
            <div className="h-10 w-px bg-white/10"></div>
            <div>
              <div className="text-xs text-[#a3a3a3] uppercase tracking-wider">Race Time</div>
              <div id="raceTime" className="text-xl text-white text-glow-cyan">{raceTime}</div>
            </div>
          </div>

          {/* Center: Deltas or FCY Status */}
          {fcyActive ? (
            <div id="fcyStatusText" className="text-2xl lg:text-3xl text-[#0a0a0a] animate-pulse-slow">
              ⚠️ FULL COURSE YELLOW ⚠️
            </div>
          ) : (
            <div id="deltaContainer" className="flex items-center gap-8">
              <div className="text-center">
                <div className="text-xs text-[#a3a3a3] uppercase tracking-wider mb-1">Ghost</div>
                <div 
                  id="ghostDelta" 
                  className={`text-2xl ${ghostDelta <= 0 ? 'text-[#a3e635] text-glow-lime' : 'text-[#f87171]'}`}
                >
                  {formatDelta(ghostDelta)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-[#a3a3a3] uppercase tracking-wider mb-1">Guardian</div>
                <div 
                  id="guardianDelta" 
                  className={`text-2xl ${guardianDelta <= 0 ? 'text-[#a3e635] text-glow-lime' : 'text-[#f87171]'}`}
                >
                  {formatDelta(guardianDelta)}
                </div>
              </div>
            </div>
          )}

          {/* Right: Live Gaps */}
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-[#a3a3a3] uppercase tracking-wider">Gap Ahead</div>
              <div 
                id="gapAhead" 
                className="text-xl text-[#06b6d4] text-glow-cyan"
              >
                {formatGap(gapAhead)}
              </div>
            </div>
            <div className="h-10 w-px bg-white/10"></div>
            <div className="text-right">
              <div className="text-xs text-[#a3a3a3] uppercase tracking-wider">Gap Behind</div>
              <div 
                id="gapBehind" 
                className="text-xl text-[#d946ef] text-glow-magenta"
              >
                {formatGap(gapBehind)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
