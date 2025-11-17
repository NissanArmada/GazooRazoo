import { useEffect, useState } from 'react';
import { Cloud, Thermometer } from 'lucide-react';

interface TrackGripProps {
  addAlert: (message: string, type: string) => void;
}

export default function TrackGrip({ addAlert }: TrackGripProps) {
  const [airTemp, setAirTemp] = useState(22);
  const [trackTemp, setTrackTemp] = useState(35);
  const [gripLevel, setGripLevel] = useState(95);
  const [weatherAlert, setWeatherAlert] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate temperature changes
      setAirTemp(prev => Math.max(15, Math.min(30, prev + (Math.random() - 0.5) * 0.5)));
      setTrackTemp(prev => Math.max(25, Math.min(50, prev + (Math.random() - 0.5) * 1)));
      setGripLevel(prev => Math.max(60, Math.min(100, prev + (Math.random() - 0.5) * 2)));

      // Random grip warnings
      if (Math.random() < 0.03) {
        setWeatherAlert('GRIP REDUCED IN SECTOR 2');
        addAlert('Track & Grip: Grip reduced in Sector 2', 'weather');
        setTimeout(() => setWeatherAlert(''), 6000);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [addAlert]);

  const getGripColor = () => {
    if (gripLevel >= 90) return '#a3e635';
    if (gripLevel >= 75) return '#06b6d4';
    if (gripLevel >= 60) return '#fbbf24';
    return '#f87171';
  };

  return (
    <div className="glass-card p-6 hover-glow-effect grain-overlay animate-fade-in" style={{ animationDelay: '0.2s' }}>
      <h3 className="text-xl mb-4 text-[#06b6d4] text-glow-cyan uppercase tracking-wider flex items-center gap-2">
        <Cloud className="w-5 h-5" />
        Track & Grip
      </h3>
      
      <div className="space-y-4">
        {/* Temperature Readings */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-black/40 rounded-lg p-3">
            <div className="text-xs text-[#a3a3a3] mb-1 uppercase tracking-wider flex items-center gap-1">
              <Thermometer className="w-3 h-3" />
              Air Temp
            </div>
            <div id="airTemp" className="text-2xl text-white">{airTemp.toFixed(1)}°C</div>
          </div>
          
          <div className="bg-black/40 rounded-lg p-3">
            <div className="text-xs text-[#a3a3a3] mb-1 uppercase tracking-wider flex items-center gap-1">
              <Thermometer className="w-3 h-3" />
              Track Temp
            </div>
            <div id="trackTemp" className="text-2xl text-white">{trackTemp.toFixed(1)}°C</div>
          </div>
        </div>

        {/* Grip Level */}
        <div className="bg-black/40 rounded-lg p-4">
          <div className="text-xs text-[#a3a3a3] mb-2 uppercase tracking-wider">Grip Level</div>
          <div className="flex items-center gap-4">
            <div 
              id="gripLevel" 
              className="text-3xl"
              style={{ 
                color: getGripColor(),
                filter: `drop-shadow(0 0 10px ${getGripColor()})`
              }}
            >
              {gripLevel.toFixed(0)}%
            </div>
            <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${gripLevel}%`,
                  backgroundColor: getGripColor(),
                  boxShadow: `0 0 10px ${getGripColor()}`
                }}
              />
            </div>
          </div>
        </div>

        {/* Weather Alert */}
        {weatherAlert && (
          <div id="weatherAlertBox" className="p-3 rounded-lg bg-[#fbbf24]/20 border border-[#fbbf24]/50 text-[#fbbf24] text-sm animate-pulse">
            ⚠️ {weatherAlert}
          </div>
        )}
      </div>
    </div>
  );
}
